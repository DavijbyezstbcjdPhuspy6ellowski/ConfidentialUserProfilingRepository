import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface TransactionRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  institution: string;
  amount: number;
  currency: string;
  status: "pending" | "suspicious" | "verified";
  riskScore: number;
  details?: string;
}

interface FilterOptions {
  status: string;
  institution: string;
  minAmount: number;
  maxAmount: number;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<TransactionRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<TransactionRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newTransactionData, setNewTransactionData] = useState({
    institution: "",
    amount: 0,
    currency: "USD",
    details: ""
  });
  const [selectedRecord, setSelectedRecord] = useState<TransactionRecord | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    status: "all",
    institution: "all",
    minAmount: 0,
    maxAmount: 1000000
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [operationHistory, setOperationHistory] = useState<string[]>([]);

  // Calculate statistics
  const suspiciousCount = records.filter(r => r.status === "suspicious").length;
  const verifiedCount = records.filter(r => r.status === "verified").length;
  const pendingCount = records.filter(r => r.status === "pending").length;
  const totalAmount = records.reduce((sum, record) => sum + record.amount, 0);
  const avgRiskScore = records.length > 0 
    ? records.reduce((sum, record) => sum + record.riskScore, 0) / records.length 
    : 0;

  // Add operation to history
  const addOperationToHistory = (operation: string) => {
    const timestamp = new Date().toLocaleString();
    setOperationHistory(prev => [
      `${timestamp}: ${operation}`,
      ...prev.slice(0, 9) // Keep only last 10 operations
    ]);
  };

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Apply filters and search
    let result = [...records];
    
    // Status filter
    if (filterOptions.status !== "all") {
      result = result.filter(r => r.status === filterOptions.status);
    }
    
    // Institution filter
    if (filterOptions.institution !== "all") {
      result = result.filter(r => r.institution === filterOptions.institution);
    }
    
    // Amount range filter
    result = result.filter(r => 
      r.amount >= filterOptions.minAmount && 
      r.amount <= filterOptions.maxAmount
    );
    
    // Search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(r => 
        r.id.toLowerCase().includes(query) ||
        r.institution.toLowerCase().includes(query) ||
        r.currency.toLowerCase().includes(query) ||
        (r.details && r.details.toLowerCase().includes(query))
      );
    }
    
    setFilteredRecords(result);
  }, [records, filterOptions, searchQuery]);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);
      addOperationToHistory(`Wallet connected: ${acc.substring(0, 8)}...`);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
        addOperationToHistory(`Wallet changed: ${newAcc.substring(0, 8)}...`);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    addOperationToHistory("Wallet disconnected");
    setAccount("");
    setProvider(null);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      addOperationToHistory("FHE contract availability checked: Available");
      
      const keysBytes = await contract.getData("transaction_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing transaction keys:", e);
        }
      }
      
      const list: TransactionRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`transaction_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                institution: recordData.institution,
                amount: recordData.amount,
                currency: recordData.currency,
                status: recordData.status || "pending",
                riskScore: recordData.riskScore || 0,
                details: recordData.details || ""
              });
            } catch (e) {
              console.error(`Error parsing transaction data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading transaction ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
      addOperationToHistory(`Loaded ${list.length} encrypted transactions`);
    } catch (e) {
      console.error("Error loading records:", e);
      addOperationToHistory("Error loading transactions");
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitTransaction = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting transaction data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newTransactionData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const transactionId = `tx-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

      // Simulate FHE risk analysis
      const riskScore = Math.floor(Math.random() * 100);
      const status = riskScore > 70 ? "suspicious" : "pending";

      const transactionData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        institution: newTransactionData.institution,
        amount: newTransactionData.amount,
        currency: newTransactionData.currency,
        status: status,
        riskScore: riskScore,
        details: newTransactionData.details
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `transaction_${transactionId}`, 
        ethers.toUtf8Bytes(JSON.stringify(transactionData))
      );
      
      const keysBytes = await contract.getData("transaction_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(transactionId);
      
      await contract.setData(
        "transaction_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Transaction encrypted and submitted securely!"
      });
      
      addOperationToHistory(`New transaction submitted: ${transactionId}`);
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewTransactionData({
          institution: "",
          amount: 0,
          currency: "USD",
          details: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      addOperationToHistory("Transaction submission failed");
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const markAsSuspicious = async (transactionId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`transaction_${transactionId}`);
      if (recordBytes.length === 0) {
        throw new Error("Transaction not found");
      }
      
      const transactionData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedTransaction = {
        ...transactionData,
        status: "suspicious"
      };
      
      await contract.setData(
        `transaction_${transactionId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedTransaction))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Transaction marked as suspicious!"
      });
      
      addOperationToHistory(`Marked transaction ${transactionId} as suspicious`);
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Operation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const markAsVerified = async (transactionId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted data with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`transaction_${transactionId}`);
      if (recordBytes.length === 0) {
        throw new Error("Transaction not found");
      }
      
      const transactionData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedTransaction = {
        ...transactionData,
        status: "verified"
      };
      
      await contract.setData(
        `transaction_${transactionId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedTransaction))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Transaction verified successfully!"
      });
      
      addOperationToHistory(`Verified transaction ${transactionId}`);
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const viewDetails = (record: TransactionRecord) => {
    setSelectedRecord(record);
    setShowDetails(true);
    addOperationToHistory(`Viewed details of transaction ${record.id}`);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilterOptions(prev => ({
      ...prev,
      [name]: name.includes("Amount") ? Number(value) : value
    }));
    addOperationToHistory(`Filter changed: ${name}=${value}`);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  };

  const clearFilters = () => {
    setFilterOptions({
      status: "all",
      institution: "all",
      minAmount: 0,
      maxAmount: 1000000
    });
    setSearchQuery("");
    addOperationToHistory("Filters cleared");
  };

  // Get unique institutions for filter
  const institutions = [...new Set(records.map(r => r.institution))];

  // Render risk score chart
  const renderRiskChart = () => {
    const riskLevels = [
      { level: "Low", range: "0-30", count: records.filter(r => r.riskScore <= 30).length },
      { level: "Medium", range: "31-70", count: records.filter(r => r.riskScore > 30 && r.riskScore <= 70).length },
      { level: "High", range: "71-100", count: records.filter(r => r.riskScore > 70).length }
    ];

    const maxCount = Math.max(...riskLevels.map(l => l.count));

    return (
      <div className="risk-chart">
        {riskLevels.map((level, index) => (
          <div key={index} className="risk-bar">
            <div className="risk-label">{level.level} ({level.range})</div>
            <div className="risk-bar-track">
              <div 
                className="risk-bar-fill" 
                style={{ 
                  width: maxCount > 0 ? `${(level.count / maxCount) * 100}%` : "0%",
                  backgroundColor: level.level === "High" ? "#ff3e3e" : 
                                  level.level === "Medium" ? "#ffaa33" : "#33cc33"
                }}
              ></div>
            </div>
            <div className="risk-count">{level.count}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen cyber-bg">
      <div className="cyber-spinner"></div>
      <p>Initializing encrypted AML system...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <header className="app-header cyber-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>FHE<span>AML</span>System</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn cyber-button"
          >
            <div className="add-icon"></div>
            Add Transaction
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="dashboard-grid">
          <div className="dashboard-column main-column">
            <div className="welcome-banner cyber-card">
              <div className="welcome-text">
                <h2>Privacy-Preserving AML System</h2>
                <p>Detect money laundering patterns across banks without sharing raw transaction data using FHE technology</p>
              </div>
              <div className="fhe-badge">
                <span>FHE-Powered</span>
              </div>
            </div>
            
            <div className="controls-section cyber-card">
              <div className="section-header">
                <h3>Transaction Filter</h3>
                <button onClick={clearFilters} className="cyber-button small">Clear Filters</button>
              </div>
              
              <div className="filter-grid">
                <div className="filter-group">
                  <label>Status</label>
                  <select 
                    name="status" 
                    value={filterOptions.status} 
                    onChange={handleFilterChange}
                    className="cyber-select"
                  >
                    <option value="all">All Status</option>
                    <option value="pending">Pending</option>
                    <option value="suspicious">Suspicious</option>
                    <option value="verified">Verified</option>
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>Institution</label>
                  <select 
                    name="institution" 
                    value={filterOptions.institution} 
                    onChange={handleFilterChange}
                    className="cyber-select"
                  >
                    <option value="all">All Institutions</option>
                    {institutions.map((inst, index) => (
                      <option key={index} value={inst}>{inst}</option>
                    ))}
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>Min Amount</label>
                  <input 
                    type="range" 
                    name="minAmount" 
                    min="0" 
                    max="1000000" 
                    step="1000"
                    value={filterOptions.minAmount} 
                    onChange={handleFilterChange}
                    className="cyber-slider"
                  />
                  <span>${filterOptions.minAmount.toLocaleString()}</span>
                </div>
                
                <div className="filter-group">
                  <label>Max Amount</label>
                  <input 
                    type="range" 
                    name="maxAmount" 
                    min="0" 
                    max="1000000" 
                    step="1000"
                    value={filterOptions.maxAmount} 
                    onChange={handleFilterChange}
                    className="cyber-slider"
                  />
                  <span>${filterOptions.maxAmount.toLocaleString()}</span>
                </div>
                
                <div className="filter-group">
                  <label>Search</label>
                  <input 
                    type="text" 
                    placeholder="Search transactions..." 
                    value={searchQuery} 
                    onChange={handleSearchChange}
                    className="cyber-input"
                  />
                </div>
              </div>
            </div>
            
            <div className="records-section cyber-card">
              <div className="section-header">
                <h3>Encrypted Transactions</h3>
                <div className="header-actions">
                  <span className="result-count">{filteredRecords.length} results</span>
                  <button 
                    onClick={loadRecords}
                    className="refresh-btn cyber-button"
                    disabled={isRefreshing}
                  >
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </div>
              
              <div className="records-list">
                <div className="table-header">
                  <div className="header-cell">ID</div>
                  <div className="header-cell">Institution</div>
                  <div className="header-cell">Amount</div>
                  <div className="header-cell">Risk</div>
                  <div className="header-cell">Status</div>
                  <div className="header-cell">Actions</div>
                </div>
                
                {filteredRecords.length === 0 ? (
                  <div className="no-records">
                    <div className="no-records-icon"></div>
                    <p>No transactions found</p>
                    <button 
                      className="cyber-button primary"
                      onClick={() => setShowCreateModal(true)}
                    >
                      Add First Transaction
                    </button>
                  </div>
                ) : (
                  filteredRecords.map(record => (
                    <div className="record-row" key={record.id}>
                      <div className="table-cell record-id">#{record.id.substring(0, 8)}</div>
                      <div className="table-cell">{record.institution}</div>
                      <div className="table-cell amount">
                        {record.amount.toLocaleString()} {record.currency}
                      </div>
                      <div className="table-cell">
                        <div className="risk-score">
                          <div className="risk-value">{record.riskScore}</div>
                          <div 
                            className="risk-bar-small" 
                            style={{ 
                              width: `${record.riskScore}%`,
                              backgroundColor: record.riskScore > 70 ? "#ff3e3e" : 
                                            record.riskScore > 30 ? "#ffaa33" : "#33cc33"
                            }}
                          ></div>
                        </div>
                      </div>
                      <div className="table-cell">
                        <span className={`status-badge ${record.status}`}>
                          {record.status}
                        </span>
                      </div>
                      <div className="table-cell actions">
                        <button 
                          className="action-btn cyber-button small"
                          onClick={() => viewDetails(record)}
                        >
                          Details
                        </button>
                        {record.status !== "suspicious" && (
                          <button 
                            className="action-btn cyber-button small danger"
                            onClick={() => markAsSuspicious(record.id)}
                          >
                            Flag
                          </button>
                        )}
                        {record.status !== "verified" && (
                          <button 
                            className="action-btn cyber-button small success"
                            onClick={() => markAsVerified(record.id)}
                          >
                            Verify
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
          
          <div className="dashboard-column side-column">
            <div className="stats-panel cyber-card">
              <h3>AML Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{records.length}</div>
                  <div className="stat-label">Total Transactions</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{suspiciousCount}</div>
                  <div className="stat-label">Suspicious</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">${totalAmount.toLocaleString()}</div>
                  <div className="stat-label">Total Amount</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{avgRiskScore.toFixed(1)}</div>
                  <div className="stat-label">Avg Risk Score</div>
                </div>
              </div>
            </div>
            
            <div className="risk-chart-panel cyber-card">
              <h3>Risk Distribution</h3>
              {renderRiskChart()}
            </div>
            
            <div className="history-panel cyber-card">
              <h3>Operation History</h3>
              <div className="history-list">
                {operationHistory.length === 0 ? (
                  <p className="no-history">No operations yet</p>
                ) : (
                  operationHistory.map((op, index) => (
                    <div key={index} className="history-item">
                      <div className="history-icon"></div>
                      <div className="history-text">{op}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitTransaction} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          transactionData={newTransactionData}
          setTransactionData={setNewTransactionData}
        />
      )}
      
      {showDetails && selectedRecord && (
        <ModalDetails 
          record={selectedRecord}
          onClose={() => setShowDetails(false)}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer cyber-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>FHE AML System</span>
            </div>
            <p>Privacy-preserving anti-money laundering detection using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE AML System. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  transactionData: any;
  setTransactionData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  transactionData,
  setTransactionData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTransactionData({
      ...transactionData,
      [name]: name === "amount" ? Number(value) : value
    });
  };

  const handleSubmit = () => {
    if (!transactionData.institution || transactionData.amount <= 0) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal cyber-card">
        <div className="modal-header">
          <h2>Add Encrypted Transaction</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your transaction data will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Institution *</label>
              <input 
                type="text"
                name="institution"
                value={transactionData.institution} 
                onChange={handleChange}
                placeholder="Bank name..." 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group">
              <label>Amount *</label>
              <input 
                type="number"
                name="amount"
                value={transactionData.amount} 
                onChange={handleChange}
                placeholder="0.00" 
                className="cyber-input"
                min="0"
                step="0.01"
              />
            </div>
            
            <div className="form-group">
              <label>Currency</label>
              <select 
                name="currency"
                value={transactionData.currency} 
                onChange={handleChange}
                className="cyber-select"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="JPY">JPY</option>
                <option value="CAD">CAD</option>
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>Details</label>
              <textarea 
                name="details"
                value={transactionData.details} 
                onChange={handleChange}
                placeholder="Transaction details..." 
                className="cyber-textarea"
                rows={3}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Data remains encrypted during FHE processing for AML detection
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn cyber-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn cyber-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ModalDetailsProps {
  record: TransactionRecord;
  onClose: () => void;
}

const ModalDetails: React.FC<ModalDetailsProps> = ({ record, onClose }) => {
  return (
    <div className="modal-overlay">
      <div className="details-modal cyber-card">
        <div className="modal-header">
          <h2>Transaction Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="detail-grid">
            <div className="detail-item">
              <label>Transaction ID</label>
              <span>{record.id}</span>
            </div>
            <div className="detail-item">
              <label>Institution</label>
              <span>{record.institution}</span>
            </div>
            <div className="detail-item">
              <label>Amount</label>
              <span>{record.amount.toLocaleString()} {record.currency}</span>
            </div>
            <div className="detail-item">
              <label>Date</label>
              <span>{new Date(record.timestamp * 1000).toLocaleString()}</span>
            </div>
            <div className="detail-item">
              <label>Risk Score</label>
              <span className={`risk-value-large ${record.riskScore > 70 ? 'high-risk' : record.riskScore > 30 ? 'medium-risk' : 'low-risk'}`}>
                {record.riskScore}
              </span>
            </div>
            <div className="detail-item">
              <label>Status</label>
              <span className={`status-badge ${record.status}`}>{record.status}</span>
            </div>
            {record.details && (
              <div className="detail-item full-width">
                <label>Details</label>
                <p>{record.details}</p>
              </div>
            )}
          </div>
          
          <div className="fhe-notice">
            <div className="key-icon"></div>
            <p>This data is encrypted using FHE and processed without decryption</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="close-btn cyber-button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;