// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Import the FHE library from FHEVM to handle encrypted data types and operations.
// euint32 is an encrypted 32-bit unsigned integer.
// ebool is an encrypted boolean.
import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";

// Import a network configuration. This could be for Sepolia, Mainnet, or a local testnet.
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title PrivacyAML
 * @notice A smart contract for a privacy-preserving Anti-Money Laundering (AML) system.
 * This system allows multiple financial institutions (banks) to collaboratively detect
 * potentially suspicious transactions without revealing the raw transaction data to each other or the blockchain.
 * It uses Fully Homomorphic Encryption (FHE) to perform checks on encrypted data.
 * ZCP-002: "隱私保護反洗錢(AML)系統"
 */
contract PrivacyAML is SepoliaConfig {

    // ================================= //
    //           Data Structures         //
    // ================================= //

    /**
     * @dev Stores the details of a transaction in its encrypted form.
     * The core financial data (`amount`) remains encrypted at all times on-chain.
     * The `isSuspicious` flag is also an encrypted boolean, computed over encrypted data.
     */
    struct EncryptedTransaction {
        uint256 id;                      // Unique identifier for the transaction.
        address submitter;               // The address of the bank that submitted the data.
        euint32 encryptedAmount;         // The encrypted transaction amount.
        ebool isSuspicious;              // An encrypted flag, true if amount > threshold.
        uint256 timestamp;               // Timestamp of the submission.
    }

    // ================================= //
    //           State Variables         //
    // ================================= //

    address public owner; // The administrator of the contract, likely a regulatory body.
    uint256 public transactionCount; // A counter for total submitted transactions.

    // A mapping of whitelisted bank addresses that are allowed to submit transactions.
    mapping(address => bool) public isParticipant;

    // Stores all submitted encrypted transactions, mapped by their ID.
    mapping(uint256 => EncryptedTransaction) public transactions;

    // The encrypted AML threshold. Transactions with an amount greater than this value will be flagged.
    // This is set by the owner and is never revealed on-chain.
    euint32 private amlThreshold;

    // To manage decryption requests. Maps an FHEVM request ID to our internal transaction ID.
    mapping(uint256 => uint256) private requestToTransactionId;

    // Stores the decrypted status of a transaction's flag.
    mapping(uint256 => bool) public decryptedFlags;
    mapping(uint256 => bool) public isFlagDecrypted;


    // ================================= //
    //               Events              //
    // ================================= //

    event ParticipantAdded(address indexed bank);
    event ThresholdSet();
    event TransactionSubmitted(uint256 indexed id, address indexed submitter);
    event DecryptionRequested(uint256 indexed transactionId);
    event FlagDecrypted(uint256 indexed transactionId, bool isSuspicious);


    // ================================= //
    //              Modifiers            //
    // ================================= //

    /**
     * @dev Restricts function access to the contract owner.
     */
    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not the owner");
        _;
    }

    /**
     * @dev Restricts function access to whitelisted participant banks.
     */
    modifier onlyParticipant() {
        require(isParticipant[msg.sender], "Caller is not a participant");
        _;
    }

    // ================================= //
    //       Contract Management         //
    // ================================= //

    /**
     * @dev Sets the contract deployer as the owner.
     */
    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Adds a new bank to the whitelist of participants.
     * @dev Only the contract owner can call this function.
     * @param _bank The address of the bank to add.
     */
    function addParticipant(address _bank) public onlyOwner {
        isParticipant[_bank] = true;
        emit ParticipantAdded(_bank);
    }

    /**
     * @notice Sets the encrypted threshold for detecting suspicious transactions.
     * @dev This must be called by the owner. The threshold itself is provided
     * in its encrypted form and is never visible on-chain.
     * @param _encryptedThreshold The encrypted AML threshold value.
     */
    function setAMLThreshold(euint32 _encryptedThreshold) public onlyOwner {
        amlThreshold = _encryptedThreshold;
        emit ThresholdSet();
    }

    // ================================= //
    //       Core AML Functionality      //
    // ================================= //

    /**
     * @notice A participant bank submits an encrypted transaction amount.
     * @dev The contract will automatically perform an encrypted comparison against the
     * AML threshold and store the encrypted result (`isSuspicious`).
     * @param _encryptedAmount The transaction amount, encrypted by the bank.
     */
    function submitTransaction(euint32 _encryptedAmount) public onlyParticipant {
        // Ensure the AML threshold has been configured by the owner.
        require(FHE.isInitialized(amlThreshold), "AML threshold is not set");

        // Perform the core FHE operation: compare the encrypted amount with the encrypted threshold.
        // FHE.gt() returns an `ebool` (encrypted boolean) which is true if `_encryptedAmount > amlThreshold`.
        ebool suspiciousFlag = FHE.gt(_encryptedAmount, amlThreshold);

        // Increment the transaction counter and assign a new ID.
        transactionCount++;
        uint256 newId = transactionCount;

        // Store the encrypted transaction data on-chain.
        transactions[newId] = EncryptedTransaction({
            id: newId,
            submitter: msg.sender,
            encryptedAmount: _encryptedAmount,
            isSuspicious: suspiciousFlag,
            timestamp: block.timestamp
        });

        emit TransactionSubmitted(newId, msg.sender);
    }


    // ================================= //
    //       Decryption Handling         //
    // ================================= //

    /**
     * @notice Request the decryption of the `isSuspicious` flag for a specific transaction.
     * @dev Only the original submitter of the transaction can request its decryption.
     * @param _transactionId The ID of the transaction to check.
     */
    function requestFlagDecryption(uint256 _transactionId) public {
        EncryptedTransaction storage transaction = transactions[_transactionId];

        // Access control: only the bank that submitted the transaction can request decryption.
        require(msg.sender == transaction.submitter, "Not the transaction submitter");
        require(transaction.id != 0, "Transaction does not exist");
        require(!isFlagDecrypted[_transactionId], "Flag is already decrypted");

        // Prepare the encrypted data (the `isSuspicious` ebool) for decryption.
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(transaction.isSuspicious);

        // Call the FHEVM precompile to request decryption. The result will be sent
        // to the `decryptFlag` callback function.
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptFlag.selector);

        // Link the FHEVM request ID to our internal transaction ID.
        requestToTransactionId[reqId] = _transactionId;

        emit DecryptionRequested(_transactionId);
    }

    /**
     * @notice The callback function that receives the decrypted data from the FHEVM network.
     * @dev This function is called by the FHEVM network, not by a user.
     * It verifies the proof and stores the plaintext result.
     * @param _requestId The FHEVM request ID.
     * @param _cleartexts The decrypted data as a bytes array.
     * @param _proof A cryptographic proof to verify the decryption was done correctly.
     */
    function decryptFlag(
        uint256 _requestId,
        bytes memory _cleartexts,
        bytes memory _proof
    ) public {
        // Find the corresponding transaction ID for this decryption request.
        uint256 transactionId = requestToTransactionId[_requestId];
        require(transactionId != 0, "Invalid request ID");
        require(!isFlagDecrypted[transactionId], "Flag is already decrypted");

        // Verify the decryption signature/proof provided by the FHEVM network.
        FHE.checkSignatures(_requestId, _cleartexts, _proof);

        // Decode the decrypted boolean value from the returned bytes.
        bool isSuspiciousResult = abi.decode(_cleartexts, (bool));

        // Store the plaintext result and mark it as decrypted.
        decryptedFlags[transactionId] = isSuspiciousResult;
        isFlagDecrypted[transactionId] = true;

        emit FlagDecrypted(transactionId, isSuspiciousResult);
    }


    // ================================= //
    //           View Functions          //
    // ================================= //

    /**
     * @notice Get the encrypted `isSuspicious` flag for a transaction.
     * @param _transactionId The ID of the transaction.
     * @return The encrypted boolean flag.
     */
    function getEncryptedFlag(uint256 _transactionId) public view returns (ebool) {
        return transactions[_transactionId].isSuspicious;
    }

    /**
     * @notice Get the encrypted AML threshold value.
     * @dev Can only be called by the owner to verify the stored value.
     * @return The encrypted threshold.
     */
    function getEncryptedThreshold() public view onlyOwner returns (euint32) {
        return amlThreshold;
    }
}