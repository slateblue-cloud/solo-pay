// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPaymentGateway
 * @author Solo Pay Team
 * @notice Interface for the PaymentGateway contract
 */
interface IPaymentGateway {
  struct PermitSignature {
    uint256 deadline;
    uint8 v;
    bytes32 r;
    bytes32 s;
  }

  // ============ Events ============

  /// @notice Emitted when the treasury address is changed
  /// @param oldTreasuryAddress The previous treasury address
  /// @param newTreasuryAddress The new treasury address
  event TreasuryChanged(address indexed oldTreasuryAddress, address indexed newTreasuryAddress);

  /// @notice Emitted when the server signer address is changed
  /// @param oldSigner The previous signer address
  /// @param newSigner The new signer address
  event SignerChanged(address indexed oldSigner, address indexed newSigner);

  /// @notice Emitted when the fee basis points is changed
  /// @param oldFeeBps The previous fee in basis points
  /// @param newFeeBps The new fee in basis points
  event FeeBpsChanged(uint16 oldFeeBps, uint16 newFeeBps);

  /// @notice Emitted when a token's whitelist status is changed
  /// @param tokenAddress The token address
  /// @param supported Whether the token is now supported
  event TokenSupportChanged(address indexed tokenAddress, bool indexed supported);

  /// @notice Emitted when a payment is escrowed
  /// @param paymentId Unique payment identifier
  /// @param merchantId Merchant identifier
  /// @param payerAddress Address of the payer
  /// @param recipientAddress Address of the recipient
  /// @param tokenAddress Address of the ERC20 token
  /// @param amount Payment amount
  /// @param escrowDeadline Escrow deadline timestamp
  /// @param timestamp Block timestamp
  event PaymentEscrowed(
    bytes32 indexed paymentId,
    bytes32 indexed merchantId,
    address indexed payerAddress,
    address recipientAddress,
    address tokenAddress,
    uint256 amount,
    uint256 escrowDeadline,
    uint256 timestamp
  );

  /// @notice Emitted when an escrowed payment is finalized
  /// @param paymentId Unique payment identifier
  /// @param merchantId Merchant identifier
  /// @param recipientAddress Address of the recipient
  /// @param tokenAddress Address of the ERC20 token
  /// @param amount Payment amount
  /// @param fee Fee amount sent to treasury
  /// @param timestamp Block timestamp
  event PaymentFinalized(
    bytes32 indexed paymentId,
    bytes32 indexed merchantId,
    address recipientAddress,
    address tokenAddress,
    uint256 amount,
    uint256 fee,
    uint256 timestamp
  );

  /// @notice Emitted when an escrowed payment is cancelled
  /// @param paymentId Unique payment identifier
  /// @param merchantId Merchant identifier
  /// @param payerAddress Address of the payer (refund recipient)
  /// @param tokenAddress Address of the ERC20 token
  /// @param amount Refunded amount
  /// @param timestamp Block timestamp
  event PaymentCancelled(
    bytes32 indexed paymentId,
    bytes32 indexed merchantId,
    address indexed payerAddress,
    address tokenAddress,
    uint256 amount,
    uint256 timestamp
  );

  /// @notice Emitted when a finalized payment is refunded
  /// @param originalPaymentId Original payment identifier
  /// @param merchantId Merchant identifier
  /// @param payerAddress Address of the payer (refund recipient)
  /// @param merchantAddress Address of the merchant (refund sender)
  /// @param tokenAddress Address of the ERC20 token
  /// @param amount Refunded amount
  /// @param timestamp Block timestamp
  event RefundCompleted(
    bytes32 indexed originalPaymentId,
    bytes32 indexed merchantId,
    address indexed payerAddress,
    address merchantAddress,
    address tokenAddress,
    uint256 amount,
    uint256 timestamp
  );

  // ============ Functions ============

  /// @notice Pay into escrow with server signature verification
  /// @param paymentId Unique payment identifier
  /// @param tokenAddress ERC20 token address
  /// @param amount Payment amount
  /// @param recipientAddress Merchant's wallet address
  /// @param merchantId Merchant identifier
  /// @param deadline Server signature expiration timestamp
  /// @param escrowDuration Escrow duration in seconds
  /// @param serverSignature Server's EIP-712 signature
  /// @param permit ERC20 Permit signature (deadline=0 to skip)
  function pay(
    bytes32 paymentId,
    address tokenAddress,
    uint256 amount,
    address recipientAddress,
    bytes32 merchantId,
    uint256 deadline,
    uint256 escrowDuration,
    bytes calldata serverSignature,
    PermitSignature calldata permit
  ) external;

  /// @notice Set the fee in basis points
  /// @param newFeeBps The new fee in basis points (0-10000)
  function setFeeBps(uint16 newFeeBps) external;

  /// @notice Finalize an escrowed payment
  /// @param paymentId The escrowed payment ID
  /// @param serverSignature Server's EIP-712 FinalizeRequest signature
  function finalize(bytes32 paymentId, bytes calldata serverSignature) external;

  /// @notice Cancel an escrowed payment
  /// @param paymentId The escrowed payment ID
  /// @param serverSignature Server's EIP-712 CancelRequest signature
  function cancel(bytes32 paymentId, bytes calldata serverSignature) external;

  /// @notice Refund a finalized payment - full amount returned from merchant to payer
  /// @param originalPaymentId The finalized payment ID
  /// @param serverSignature Server's EIP-712 signature
  /// @param permit Permit signature for gasless token approval
  function refund(
    bytes32 originalPaymentId,
    bytes calldata serverSignature,
    PermitSignature calldata permit
  ) external;

  /// @notice Set whether a token is supported
  /// @param tokenAddress The token address
  /// @param supported Whether the token should be supported
  function setSupportedToken(address tokenAddress, bool supported) external;

  /// @notice Check if a token is supported
  /// @param tokenAddress The token address to check
  /// @return True if the token is supported
  function supportedTokens(address tokenAddress) external view returns (bool);

  /// @notice Check if a payment has been processed
  /// @param paymentId The payment ID to check
  /// @return True if the payment has been processed
  function isPaymentProcessed(bytes32 paymentId) external view returns (bool);

  /// @notice Check if a payment has been refunded
  /// @param paymentId The payment ID to check
  /// @return True if the payment has been refunded
  function isPaymentRefunded(bytes32 paymentId) external view returns (bool);
}
