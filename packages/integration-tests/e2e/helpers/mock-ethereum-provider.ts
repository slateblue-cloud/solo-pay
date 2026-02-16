/**
 * Mock window.ethereum provider for Playwright E2E tests.
 *
 * This script is injected into the browser page via page.addInitScript().
 * It creates a minimal EIP-1193 provider that:
 * - Connects to hardhat node via JSON-RPC
 * - Uses a hardcoded test private key for signing
 * - Handles eth_requestAccounts, eth_signTypedData_v4, eth_sendTransaction
 * - Makes RainbowKit detect it as an "Injected" wallet
 *
 * NOTE: This runs in the BROWSER context — no Node.js imports allowed.
 * All crypto operations use the browser's SubtleCrypto or manual implementation.
 */

// This function returns the script string to be injected
export function getMockProviderScript(params: {
  rpcUrl: string;
  privateKey: string;
  address: string;
  chainId: number;
}): string {
  return `
(function() {
  const RPC_URL = ${JSON.stringify(params.rpcUrl)};
  const PRIVATE_KEY = ${JSON.stringify(params.privateKey)};
  const ADDRESS = ${JSON.stringify(params.address.toLowerCase())};
  const CHAIN_ID = ${JSON.stringify(params.chainId)};
  const CHAIN_ID_HEX = '0x' + CHAIN_ID.toString(16);

  let requestId = 0;

  // JSON-RPC helper
  async function rpcCall(method, params) {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params: params || [] }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  // EIP-712 signing via hardhat's eth_signTypedData_v4
  // We forward to hardhat node which has the private key imported
  async function signTypedDataV4(address, typedData) {
    // hardhat_impersonateAccount lets us sign as any account
    // But hardhat node already has Account #3 key, so we use eth_signTypedData_v4 directly
    // However, hardhat JSON-RPC doesn't support eth_signTypedData_v4 natively.
    // We need to use the personal_sign approach or import the key.
    // Actually, we'll use a different approach: forward to a signer endpoint.

    // For hardhat, we can use eth_sign or we do it in-browser with SubtleCrypto.
    // The simplest approach: use hardhat's built-in signing by impersonating the account.

    // Parse the typed data
    const data = typeof typedData === 'string' ? JSON.parse(typedData) : typedData;

    // Use eth_signTypedData_v4 which hardhat supports when the account is unlocked
    try {
      const result = await rpcCall('eth_signTypedData_v4', [address, typeof typedData === 'string' ? typedData : JSON.stringify(typedData)]);
      return result;
    } catch (e) {
      console.error('[MockProvider] eth_signTypedData_v4 failed:', e.message);
      throw e;
    }
  }

  // Event listeners
  const listeners = {};

  function emit(event, data) {
    if (listeners[event]) {
      listeners[event].forEach(fn => fn(data));
    }
  }

  // The mock provider
  const provider = {
    isMetaMask: true,
    isConnected: () => true,
    chainId: CHAIN_ID_HEX,
    networkVersion: String(CHAIN_ID),
    selectedAddress: ADDRESS,

    on(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      return provider;
    },

    removeListener(event, fn) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(f => f !== fn);
      }
      return provider;
    },

    removeAllListeners(event) {
      if (event) delete listeners[event];
      else Object.keys(listeners).forEach(k => delete listeners[k]);
      return provider;
    },

    async request({ method, params }) {
      switch (method) {
        case 'eth_requestAccounts':
          // Emit connect and accountsChanged events after returning
          setTimeout(() => {
            emit('connect', { chainId: CHAIN_ID_HEX });
            emit('accountsChanged', [ADDRESS]);
            emit('chainChanged', CHAIN_ID_HEX);
          }, 100);
          return [ADDRESS];

        case 'eth_accounts':
          return [ADDRESS];

        case 'eth_chainId':
          return CHAIN_ID_HEX;

        case 'net_version':
          return String(CHAIN_ID);

        case 'wallet_switchEthereumChain': {
          // Accept any chain switch request silently
          return null;
        }

        case 'wallet_addEthereumChain': {
          return null;
        }

        case 'wallet_requestPermissions': {
          return [{ parentCapability: 'eth_accounts' }];
        }

        case 'wallet_getPermissions': {
          return [{ parentCapability: 'eth_accounts' }];
        }

        case 'metamask_getProviderState': {
          return {
            isUnlocked: true,
            chainId: CHAIN_ID_HEX,
            networkVersion: String(CHAIN_ID),
            accounts: [ADDRESS],
          };
        }

        case 'eth_signTypedData_v4': {
          const [signerAddress, typedData] = params;
          return signTypedDataV4(signerAddress, typedData);
        }

        case 'personal_sign': {
          const [message, signerAddress] = params;
          return rpcCall('personal_sign', [message, signerAddress]);
        }

        case 'eth_sendTransaction': {
          const [tx] = params;
          // Ensure from is set
          const fullTx = { ...tx, from: tx.from || ADDRESS };
          return rpcCall('eth_sendTransaction', [fullTx]);
        }

        // Proxy all other calls to hardhat node
        default:
          return rpcCall(method, params || []);
      }
    },

    // Legacy API
    enable() {
      return Promise.resolve([ADDRESS]);
    },
    send(method, params) {
      if (typeof method === 'string') {
        return provider.request({ method, params });
      }
      // Legacy send with callback
      return provider.request({ method: method.method, params: method.params });
    },
    sendAsync(payload, callback) {
      provider.request({ method: payload.method, params: payload.params })
        .then(result => callback(null, { id: payload.id, jsonrpc: '2.0', result }))
        .catch(error => callback(error));
    },
  };

  // Inject as window.ethereum before any app code runs
  Object.defineProperty(window, 'ethereum', {
    value: provider,
    writable: false,
    configurable: true,
  });

  // EIP-6963: announce the provider so RainbowKit detects it
  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: Object.freeze({
      info: {
        uuid: 'e2e-test-wallet',
        name: 'E2E Test Wallet',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
        rdns: 'io.metamask',
      },
      provider,
    }),
  }));

  // Also respond to requestProvider events
  window.addEventListener('eip6963:requestProvider', () => {
    window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
      detail: Object.freeze({
        info: {
          uuid: 'e2e-test-wallet',
          name: 'E2E Test Wallet',
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
          rdns: 'io.metamask',
        },
        provider,
      }),
    }));
  });

  // Signal to the demo app that we're in E2E test mode
  window.__E2E_TEST__ = true;

  console.log('[MockProvider] Injected mock ethereum provider for address:', ADDRESS);
})();
`;
}
