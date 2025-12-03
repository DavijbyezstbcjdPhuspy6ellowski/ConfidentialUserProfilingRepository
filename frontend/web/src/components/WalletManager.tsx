import React, { useState, useEffect, useRef } from 'react';
import { Wallet, LogOut, RefreshCw } from 'lucide-react';

interface WalletManagerProps {
  account: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

export default function WalletManager({ account, onConnect, onDisconnect }: WalletManagerProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const parent = containerRef.current.parentElement;
    if (!parent) return;
    
    const bgColor = getComputedStyle(parent).backgroundColor;
    const isDark = isDarkBackground(bgColor);
    
    setTheme(isDark ? 'dark' : 'light');
    
    const observer = new MutationObserver(() => {
      const newBgColor = getComputedStyle(parent).backgroundColor;
      const newIsDark = isDarkBackground(newBgColor);
      
      if (newIsDark !== isDark) {
        setTheme(newIsDark ? 'dark' : 'light');
      }
    });
    
    observer.observe(parent, {
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    
    return () => observer.disconnect();
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await onConnect();
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    onDisconnect();
  };

  // 改进的配色方案
  const themeVariables = {
    light: {
      '--wallet-primary': '#4facfe',
      '--wallet-primary-hover': '#00f2fe',
      '--wallet-secondary': '#e6f7ff',
      '--wallet-secondary-hover': '#bae7ff',
      '--wallet-danger': '#ff4d4f',
      '--wallet-danger-hover': '#ff7875',
      '--wallet-text': '#1890ff',
      '--wallet-text-inverted': '#ffffff',
      '--wallet-border': '#91d5ff',
      '--wallet-shadow': '0 4px 12px rgba(0, 0, 0, 0.1)',
      '--wallet-shadow-hover': '0 6px 16px rgba(0, 0, 0, 0.15)',
      '--wallet-bg': 'transparent',
    },
    dark: {
      // 更现代、更协调的暗色主题
      '--wallet-primary': '#7b68ee', // 柔和的紫色
      '--wallet-primary-hover': '#9370db', // 浅紫色
      '--wallet-secondary': '#2d3748', // 深灰蓝色
      '--wallet-secondary-hover': '#4a5568', // 中灰蓝色
      '--wallet-danger': '#e53e3e', // 柔和的红色
      '--wallet-danger-hover': '#fc8181', // 浅红色
      '--wallet-text': '#e2e8f0', // 浅灰色
      '--wallet-text-inverted': '#ffffff',
      '--wallet-border': '#4a5568', // 中灰蓝色
      '--wallet-shadow': '0 4px 12px rgba(0, 0, 0, 0.4)',
      '--wallet-shadow-hover': '0 6px 16px rgba(0, 0, 0, 0.5)',
      '--wallet-bg': 'rgba(26, 32, 44, 0.8)', // 半透明深蓝灰色背景
    }
  };

  const currentTheme = themeVariables[theme];

  if (!account) {
    return (
      <div ref={containerRef} style={currentTheme as React.CSSProperties}>
        <button
          onClick={handleConnect}
          disabled={isConnecting}
          className="wallet-connect-button"
        >
          <Wallet size={16} />
          <span>{isConnecting ? 'Connecting...' : 'Connect Wallet'}</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={currentTheme as React.CSSProperties} className="wallet-container">
      {/* Account Info */}
      <div className="wallet-account">
        <span>
          {account.slice(0, 6)}...{account.slice(-4)}
        </span>
      </div>

      {/* Refresh Button */}
      <button
        onClick={handleConnect}
        className="wallet-refresh-button"
      >
        <RefreshCw size={16} />
      </button>

      {/* Disconnect Button */}
      <button
        onClick={handleDisconnect}
        className="wallet-disconnect-button"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}

function isDarkBackground(color: string): boolean {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)/);
  if (!match) return false;
  
  const r = parseInt(match[1], 10);
  const g = parseInt(match[2], 10);
  const b = parseInt(match[3], 10);
  
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  
  return luminance < 0.4;
}

// 改进的样式
const styles = `
.wallet-connect-button {
  padding: 10px 16px;
  border-radius: 8px;
  background: linear-gradient(45deg, var(--wallet-primary), var(--wallet-primary-hover));
  border: none;
  color: var(--wallet-text-inverted);
  cursor: pointer;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: var(--wallet-shadow);
  transition: all 0.2s ease;
  opacity: 1;
  position: relative;
  overflow: hidden;
  z-index: 1;
}

.wallet-connect-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.wallet-connect-button:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow: var(--wallet-shadow-hover);
}

.wallet-connect-button:before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(45deg, 
    rgba(255, 255, 255, 0.2) 0%, 
    rgba(255, 255, 255, 0.1) 50%, 
    rgba(255, 255, 255, 0.2) 100%);
  z-index: -1;
  opacity: 0.5;
  transition: opacity 0.3s ease;
}

.wallet-connect-button:hover:before {
  opacity: 0.8;
}

.wallet-container {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--wallet-bg);
  border-radius: 12px;
  padding: 6px;
  backdrop-filter: blur(4px);
}

.wallet-account {
  background: var(--wallet-secondary);
  border: 1px solid var(--wallet-border);
  border-radius: 8px;
  padding: 10px 16px;
  color: var(--wallet-text);
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.wallet-account:before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(45deg, 
    rgba(255, 255, 255, 0.1) 0%, 
    rgba(255, 255, 255, 0.05) 50%, 
    rgba(255, 255, 255, 0.1) 100%);
  z-index: -1;
  opacity: 0.3;
}

.wallet-refresh-button,
.wallet-disconnect-button {
  background: var(--wallet-secondary);
  border: 1px solid var(--wallet-border);
  color: var(--wallet-text);
  padding: 10px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.wallet-refresh-button:hover,
.wallet-disconnect-button:hover {
  transform: translateY(-2px);
}

.wallet-refresh-button:before,
.wallet-disconnect-button:before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(45deg, 
    rgba(255, 255, 255, 0.1) 0%, 
    rgba(255, 255, 255, 0.05) 50%, 
    rgba(255, 255, 255, 0.1) 100%);
  z-index: -1;
  opacity: 0.3;
  transition: opacity 0.3s ease;
}

.wallet-refresh-button:hover:before,
.wallet-disconnect-button:hover:before {
  opacity: 0.5;
}

.wallet-refresh-button:hover {
  background: var(--wallet-secondary-hover);
}

.wallet-disconnect-button {
  background: var(--wallet-danger);
  color: var(--wallet-text-inverted);
}

.wallet-disconnect-button:hover {
  background: var(--wallet-danger-hover);
}
`;

if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.innerHTML = styles;
  document.head.appendChild(styleElement);
}