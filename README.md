# FHEAMLSystem

A decentralized FinTech solution enabling financial institutions to collaboratively detect money laundering patterns using Fully Homomorphic Encryption (FHE), all without sharing sensitive raw transaction data.

## Project Background

Traditional Anti-Money Laundering (AML) systems face a fundamental conflict between data sharing and privacy:

- **Data Silos**: Financial institutions are legally and commercially restricted from sharing customer transaction data, which allows illicit activities to go undetected across different banks.  
- **Privacy & Compliance Risks**: Sharing raw data for collaborative analysis introduces significant risks of data breaches and violations of regulations like GDPR.  
- **Inefficient Detection**: Without a complete picture, individual banks have a limited view of transaction networks, making it difficult to spot sophisticated money laundering schemes.  
- **Lack of Trust**: Institutions are hesitant to share data with a central authority, fearing misuse or competitive disadvantage.  

This Privacy-Preserving AML System solves these challenges by creating a trustless collaboration environment powered by FHE and blockchain technology:

- All transaction data is encrypted by the participating bank before being submitted.  
- The system performs computations (e.g., checking against a threshold) directly on the encrypted data.  
- No raw data is ever exposed to other participants or the underlying network.  
- The entire process is transparent, verifiable, and governed by a consortium of trusted members.  

## Features

### Core Functionality

- **Encrypted Transaction Submission**: Participating banks can submit encrypted transaction data (e.g., amount) to the shared smart contract.  
- **FHE-Powered Anomaly Detection**: The system automatically compares encrypted transaction values against a pre-defined encrypted threshold to identify suspicious activity.  
- **Encrypted Alert Generation**: When a transaction is flagged, an encrypted alert is generated and stored on-chain, preserving the confidentiality of the result.  
- **Federated Data Governance**: Access is restricted to a whitelist of approved institutions, managed by a designated owner or a consortium.  
- **Secure Data Access**: Banks can request decryption of alerts related to their own submitted data to take further action.  

### Privacy & Security

- **Client-Side Encryption**: All sensitive data is encrypted before leaving the bank's secure environment.  
- **End-to-End Confidentiality**: Data remains encrypted on-chain, during computation, and in storage.  
- **Immutable Records**: All submissions and alerts are recorded on an immutable ledger, providing a tamper-proof audit trail.  
- **Verifiable Computation**: The detection logic is embedded in a public smart contract, making the process transparent and verifiable by all participants.  

## Architecture

### Blockchain Layer (Smart Contracts)

**PrivacyAML.sol (FHEVM)** — deployed on an FHE-enabled blockchain (e.g., Zama's fhEVM):  
- Manages the registry of participating institutions  
- Accepts encrypted transaction submissions  
- Performs on-chain FHE comparisons to detect anomalies  
- Stores encrypted transaction data and resulting alerts immutably  

### FHE Computation Engine (Backend)

- **Technology**: Rust (using Actix/Rocket) and the **TFHE-rs** library  
- Supports the FHEVM network by running nodes capable of performing threshold decryption  
- Can be extended to handle more complex, off-chain FHE-powered machine learning models for advanced pattern recognition  

### Frontend Application (Institutional Portal)

- **Technology**: React + TypeScript  
- Provides a secure dashboard for participating banks  
- **Ethers.js**: Handles blockchain interaction, including data encryption and contract calls  
- Allows users to submit encrypted data, monitor transaction status, and manage alerts  

## Technology Stack

### Blockchain

- Solidity ^0.8.24: Smart contract development  
- FHEVM / @fhevm/solidity: Zama's FHE library for Solidity  
- Hardhat: Development, testing, and deployment framework  
- Ethereum Sepolia Testnet: Current deployment and testing network  

### Backend

- Rust: For high-performance, secure backend services  
- TFHE-rs: Rust implementation of the TFHE scheme for FHE  
- Actix / Rocket: Web frameworks for robust APIs  

### Frontend

- React 18 + TypeScript: Modern UI framework  
- Ethers.js: Ethereum blockchain interaction  
- Tailwind CSS: Styling and responsive layout  
- Vercel: Frontend deployment platform  

## Installation

### Prerequisites

- Node.js 18+  
- npm / yarn / pnpm package manager  
- Rust and Cargo  
- Ethereum wallet (MetaMask, WalletConnect, etc.)  

### Setup

```bash
# Clone the repository
git clone <your-repo-url>
cd <your-repo-name>

# --- Install and Deploy Contracts ---
cd contracts
npm install
# Configure your deploy script and hardhat.config.js
npx hardhat run deploy/deploy.ts --network sepolia

# --- Setup and run the Backend ---
cd ../backend
# Follow backend-specific setup instructions
cargo run

# --- Setup and run the Frontend ---
cd ../frontend
npm install
npm run dev
```

## Usage

- **Onboard Institution**: The contract owner (e.g., regulator) whitelists a new financial institution.  
- **Set Threshold**: The owner sets the encrypted AML threshold in the smart contract.  
- **Submit Transaction**: A bank encrypts transaction data through the portal and submits it.  
- **Monitor Alerts**: The system flags suspicious transactions. Alerts remain encrypted.  
- **Request Decryption**: The submitting bank can request decryption of alerts to confirm status and investigate internally.  

## Security Features

- **Encrypted Submission**: Transaction data is never exposed in plaintext.  
- **Immutable Audit Trail**: All actions permanently recorded on-chain.  
- **Privacy by Design**: Built for confidentiality and compliance.  
- **Controlled Access**: Only verified and whitelisted institutions can participate.  

## Future Enhancements

- **Advanced FHE-Powered Models**: More complex ML models for encrypted anomaly detection  
- **Zero-Knowledge Proofs**: Proof of compliance without revealing sensitive data  
- **DAO Governance**: Transition to consortium-led decentralized governance  
- **Cross-Chain Interoperability**: Operate across multiple blockchain networks for broader adoption  
