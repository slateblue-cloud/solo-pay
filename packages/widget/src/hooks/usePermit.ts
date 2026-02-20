import { useCallback, useState } from 'react';
import { useReadContract, useWalletClient, usePublicClient } from 'wagmi';
import { encodeAbiParameters, keccak256 } from 'viem';
import { ERC20_ABI } from '../lib/contracts';

// ============================================================================
// Types
// ============================================================================

/** Permit signature data for PaymentGateway.pay() */
export interface PermitSignature {
  deadline: bigint;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

/** Zero permit — used when token doesn't support EIP-2612 (traditional approve flow) */
export const ZERO_PERMIT: PermitSignature = {
  deadline: BigInt(0),
  v: 0,
  r: '0x0000000000000000000000000000000000000000000000000000000000000000',
  s: '0x0000000000000000000000000000000000000000000000000000000000000000',
};

export interface UsePermitParams {
  /** ERC20 token address */
  tokenAddress: `0x${string}` | undefined;
  /** Spender address (PaymentGateway contract) */
  spenderAddress: `0x${string}` | undefined;
  /** Amount to permit */
  amount: bigint | undefined;
  /** Chain ID */
  chainId: number | undefined;
}

export interface UsePermitReturn {
  /** Whether the token supports EIP-2612 permit */
  isPermitSupported: boolean | undefined;
  /** Whether permit check is loading */
  isCheckingPermit: boolean;
  /** Sign a permit and return the signature */
  signPermit: () => Promise<PermitSignature>;
  /** Whether permit signing is in progress */
  isSigning: boolean;
  /** Permit signing error */
  error: Error | null;
}

// ============================================================================
// Helpers
// ============================================================================

const EIP712_DOMAIN_TYPEHASH = keccak256(
  new TextEncoder().encode(
    'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
  )
);

function computeDomainSeparator(
  name: string,
  version: string,
  chainId: bigint,
  verifyingContract: `0x${string}`
): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'address' },
      ],
      [
        EIP712_DOMAIN_TYPEHASH,
        keccak256(new TextEncoder().encode(name)),
        keccak256(new TextEncoder().encode(version)),
        chainId,
        verifyingContract,
      ]
    )
  );
}

/**
 * Resolve the EIP-712 domain version for a token's permit.
 *
 * Priority:
 * 1. eip712Domain() (EIP-5267 standard)
 * 2. version() (USDC-style)
 * 3. Brute-force '1', '2' against DOMAIN_SEPARATOR()
 */
async function resolvePermitVersion(
  publicClient: ReturnType<typeof usePublicClient>,
  tokenAddress: `0x${string}`,
  tokenName: string,
  chainId: number
): Promise<string> {
  if (!publicClient) throw new Error('No public client');

  // 1. Try eip712Domain() (EIP-5267)
  try {
    const result = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'eip712Domain',
    });
    return result[2]; // version field
  } catch {
    // not supported
  }

  // 2. Try version()
  try {
    const ver = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'version',
    });
    return ver as string;
  } catch {
    // not supported
  }

  // 3. Brute-force against DOMAIN_SEPARATOR()
  const actualSeparator = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'DOMAIN_SEPARATOR',
  });

  for (const candidate of ['1', '2', '3']) {
    const computed = computeDomainSeparator(tokenName, candidate, BigInt(chainId), tokenAddress);
    if (computed.toLowerCase() === (actualSeparator as string).toLowerCase()) {
      return candidate;
    }
  }

  // Default fallback
  return '1';
}

// ============================================================================
// Hook
// ============================================================================

export function usePermit({
  tokenAddress,
  spenderAddress,
  amount,
  chainId,
}: UsePermitParams): UsePermitReturn {
  const [isSigning, setIsSigning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId });
  const userAddress = walletClient?.account?.address;

  // Probe for EIP-2612 support: check nonces(address) function
  const {
    data: nonce,
    isLoading: isNonceLoading,
    isError: isNonceError,
  } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'nonces',
    args: userAddress ? [userAddress] : undefined,
    chainId,
    query: {
      enabled: !!tokenAddress && !!userAddress,
      retry: false,
    },
  });

  // Probe for DOMAIN_SEPARATOR
  const { isLoading: isDomainLoading, isError: isDomainError } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'DOMAIN_SEPARATOR',
    chainId,
    query: {
      enabled: !!tokenAddress,
      retry: false,
    },
  });

  // Read token name for EIP-712 domain
  const { data: tokenName } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'name',
    chainId,
    query: {
      enabled: !!tokenAddress,
    },
  });

  const isCheckingPermit = isNonceLoading || isDomainLoading;

  // Token supports permit if both nonces and DOMAIN_SEPARATOR calls succeed
  const isPermitSupported = isCheckingPermit
    ? undefined
    : !isNonceError && !isDomainError && nonce !== undefined;

  const signPermit = useCallback(async (): Promise<PermitSignature> => {
    if (!walletClient || !walletClient.account) {
      throw new Error('Wallet not connected');
    }
    if (!tokenAddress || !spenderAddress || !amount || !chainId) {
      throw new Error('Missing permit parameters');
    }
    if (!isPermitSupported) {
      throw new Error('Token does not support EIP-2612 permit');
    }
    if (nonce === undefined) {
      throw new Error('Could not fetch nonce from token contract');
    }

    try {
      setIsSigning(true);
      setError(null);

      const version = await resolvePermitVersion(
        publicClient,
        tokenAddress,
        tokenName as string,
        chainId
      );

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      const domain = {
        name: tokenName as string,
        version,
        chainId: BigInt(chainId),
        verifyingContract: tokenAddress,
      };

      const types = {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      };

      const message = {
        owner: walletClient.account.address,
        spender: spenderAddress,
        value: amount,
        nonce,
        deadline,
      };

      const signature = await walletClient.signTypedData({
        domain,
        types,
        primaryType: 'Permit',
        message,
      });

      const r = `0x${signature.slice(2, 66)}` as `0x${string}`;
      const s = `0x${signature.slice(66, 130)}` as `0x${string}`;
      let v = parseInt(signature.slice(130, 132), 16);
      if (v < 27) {
        v += 27;
      }

      return { deadline, v, r, s };
    } catch (err) {
      const permitError = err instanceof Error ? err : new Error('Permit signing failed');
      setError(permitError);
      throw permitError;
    } finally {
      setIsSigning(false);
    }
  }, [
    walletClient,
    publicClient,
    tokenAddress,
    spenderAddress,
    amount,
    chainId,
    isPermitSupported,
    nonce,
    tokenName,
  ]);

  return {
    isPermitSupported,
    isCheckingPermit,
    signPermit,
    isSigning,
    error,
  };
}
