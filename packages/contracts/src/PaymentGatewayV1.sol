// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { ERC2771ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/EIP712Upgradeable.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IPaymentGateway } from "./interfaces/IPaymentGateway.sol";

/**
 * @title PaymentGatewayV1
 * @author MSQ Team
 * @notice Escrow-based blockchain payment gateway with meta-transaction support
 * @dev Uses UUPS proxy pattern for upgradeability and ERC2771 for meta-transactions
 *
 * All payments go through escrow:
 * - pay(): Payer deposits tokens into contract (Escrowed)
 * - finalize(): Server confirms, tokens released to merchant (Finalized)
 * - cancel(): Tokens returned to payer (Cancelled)
 * - refund(): Post-finalization refund from merchant to payer (Refunded)
 *
 * @custom:security-contact security@msq.io
 */
contract PaymentGatewayV1 is
  UUPSUpgradeable,
  OwnableUpgradeable,
  ERC2771ContextUpgradeable,
  ReentrancyGuardUpgradeable,
  EIP712Upgradeable,
  IPaymentGateway
{
  using SafeERC20 for IERC20;
  using ECDSA for bytes32;

  /// @notice EIP-712 typehash for PaymentRequest
  /// @dev keccak256("PaymentRequest(bytes32 paymentId,address tokenAddress,uint256 amount,address recipientAddress,bytes32 merchantId,uint256 deadline,uint256 escrowDuration)")
  bytes32 public constant PAYMENT_REQUEST_TYPEHASH =
    0x4c9a1d78b1a0b9e8b33a9b69e03b89406e4ef1213a14b704777a3d0a79833695;

  /// @notice EIP-712 typehash for RefundRequest
  /// @dev keccak256("RefundRequest(bytes32 paymentId)")
  bytes32 public constant REFUND_REQUEST_TYPEHASH =
    0xa7a07684522dbe178ba65248f3194c7b61eb09fe0c9bd07ba4f8b26601440dd4;

  /// @notice EIP-712 typehash for FinalizeRequest
  /// @dev keccak256("FinalizeRequest(bytes32 paymentId)")
  bytes32 public constant FINALIZE_REQUEST_TYPEHASH =
    0x61992068a07dd9b00412f89bbb59a5e12aefbf434488b2455eb7e91e8b6035a9;

  /// @notice EIP-712 typehash for CancelRequest
  /// @dev keccak256("CancelRequest(bytes32 paymentId)")
  bytes32 public constant CANCEL_REQUEST_TYPEHASH =
    0xb75b6ec39be5cb7158d6f02324c4273b2411518a383786fa4b37e7c759596f51;

  /// @notice Maximum fee percentage (100% = 10000 basis points)
  uint16 public constant MAX_FEE_BPS = 10000;

  /// @notice Maximum escrow duration (30 days)
  uint256 public constant MAX_ESCROW_DURATION = 2592000;

  enum PaymentStatus {
    None,
    Escrowed,
    Finalized,
    Cancelled,
    Refunded
  }

  struct Payment {
    address payer; // slot 1: 20 bytes
    uint16 feeBps; // slot 1: +2 bytes (22/32)
    address token; // slot 2: 20 bytes
    address recipient; // slot 3: 20 bytes
    uint256 amount; // slot 4: 32 bytes
    bytes32 merchantId; // slot 5: 32 bytes
    uint256 escrowDeadline; // slot 6: 32 bytes
  }

  /// @notice Payment status by paymentId
  mapping(bytes32 => PaymentStatus) public paymentStatus;

  /// @notice Payment data by paymentId
  mapping(bytes32 => Payment) public payments;

  /// @notice Mapping of token addresses to their supported status
  mapping(address => bool) public supportedTokens;

  /// @notice Whether token whitelist is enforced
  bool public enforceTokenWhitelist;

  /// @notice Address of the treasury
  address public treasuryAddress;

  /// @notice Address of the server signer for payment authorization
  address public signerAddress;

  /// @notice Fee in basis points applied to payments (0-10000)
  uint16 public feeBps;

  /// @notice Initialize the trusted forwarder and disable initializers
  /// @param trustedForwarderAddress Address of the ERC2771 trusted forwarder
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor(address trustedForwarderAddress) ERC2771ContextUpgradeable(trustedForwarderAddress) {
    _disableInitializers();
  }

  /**
   * @notice Initialize the contract
   * @param owner Address of the contract owner
   * @param treasury Address of the treasury
   * @param signer Address of the server signer for payment authorization
   */
  function initialize(address owner, address treasury, address signer) public initializer {
    __UUPSUpgradeable_init();
    __Ownable_init(owner);
    __ReentrancyGuard_init();
    __EIP712_init("SoloPayGateway", "1");

    enforceTokenWhitelist = false;
    _setTreasury(treasury);
    _setSigner(signer);
  }

  /**
   * @notice Internal function to set treasury address
   * @dev Emits TreasuryChanged event
   * @param newTreasuryAddress The new treasury address
   */
  function _setTreasury(address newTreasuryAddress) internal {
    require(newTreasuryAddress != address(0), "PG: invalid treasury");
    address oldTreasuryAddress = treasuryAddress;
    treasuryAddress = newTreasuryAddress;
    emit TreasuryChanged(oldTreasuryAddress, newTreasuryAddress);
  }

  /**
   * @notice Set the treasury address
   * @dev Only callable by owner
   * @param newTreasuryAddress The new treasury address
   */
  function setTreasury(address newTreasuryAddress) external onlyOwner {
    _setTreasury(newTreasuryAddress);
  }

  /**
   * @notice Internal function to set server signer address
   * @dev Emits SignerChanged event
   * @param newSigner The new server signer address
   */
  function _setSigner(address newSigner) internal {
    require(newSigner != address(0), "PG: invalid signer");
    address oldSigner = signerAddress;
    signerAddress = newSigner;
    emit SignerChanged(oldSigner, newSigner);
  }

  /**
   * @notice Set the server signer address
   * @dev Only callable by owner
   * @param newSigner The new server signer address
   */
  function setSigner(address newSigner) external onlyOwner {
    _setSigner(newSigner);
  }

  /**
   * @notice Set the fee in basis points
   * @dev Only callable by owner
   * @param newFeeBps The new fee in basis points (0-10000)
   */
  function setFeeBps(uint16 newFeeBps) external onlyOwner {
    require(newFeeBps <= MAX_FEE_BPS, "PG: fee too high");
    uint16 oldFeeBps = feeBps;
    feeBps = newFeeBps;
    emit FeeBpsChanged(oldFeeBps, newFeeBps);
  }

  /**
   * @notice Pay into escrow with server signature verification
   * @dev Tokens are transferred from payer to this contract.
   *      Uses _msgSender() to support both direct calls and meta-transactions
   *      Supports ERC20 Permit for gasless token approval
   * @param paymentId Unique payment identifier (bytes32)
   * @param tokenAddress ERC20 token address
   * @param amount Payment amount in token's smallest unit
   * @param recipientAddress Merchant's wallet address
   * @param merchantId Merchant identifier (bytes32)
   * @param deadline Server signature expiration timestamp
   * @param escrowDuration Escrow duration in seconds
   * @param serverSignature Server's EIP-712 signature
   * @param permit ERC20 Permit signature (deadline=0 to skip)
   */
  function pay(
    bytes32 paymentId,
    address tokenAddress,
    uint256 amount,
    address recipientAddress,
    bytes32 merchantId,
    uint256 deadline,
    uint256 escrowDuration,
    bytes calldata serverSignature,
    IPaymentGateway.PermitSignature calldata permit
  ) external nonReentrant {
    address payerAddress = _msgSender();

    _tryPermit(tokenAddress, payerAddress, amount, permit);
    _validatePayment(paymentId, tokenAddress, amount, recipientAddress, deadline);
    require(
      escrowDuration > 0 && escrowDuration <= MAX_ESCROW_DURATION,
      "PG: invalid escrowDuration"
    );
    require(
      _verifyPaymentSignature(
        paymentId,
        tokenAddress,
        amount,
        recipientAddress,
        merchantId,
        deadline,
        escrowDuration,
        serverSignature
      ),
      "PG: invalid signature"
    );
    if (enforceTokenWhitelist) {
      require(supportedTokens[tokenAddress], "PG: token not supported");
    }

    uint256 escrowDeadline = block.timestamp + escrowDuration;
    paymentStatus[paymentId] = PaymentStatus.Escrowed;
    payments[paymentId] = Payment({
      payer: payerAddress,
      feeBps: feeBps,
      token: tokenAddress,
      recipient: recipientAddress,
      amount: amount,
      merchantId: merchantId,
      escrowDeadline: escrowDeadline
    });

    IERC20(tokenAddress).safeTransferFrom(payerAddress, address(this), amount);
    emit PaymentEscrowed(
      paymentId,
      merchantId,
      payerAddress,
      recipientAddress,
      tokenAddress,
      amount,
      escrowDeadline,
      block.timestamp
    );
  }

  /**
   * @notice Internal function to validate payment inputs
   * @param paymentId Payment identifier
   * @param tokenAddress Token address
   * @param amount Payment amount
   * @param recipientAddress Recipient address
   * @param deadline Signature deadline
   */
  function _validatePayment(
    bytes32 paymentId,
    address tokenAddress,
    uint256 amount,
    address recipientAddress,
    uint256 deadline
  ) internal view {
    require(block.timestamp <= deadline, "PG: expired");
    require(treasuryAddress != address(0), "PG: treasury not set");
    require(signerAddress != address(0), "PG: signer not set");
    require(paymentStatus[paymentId] == PaymentStatus.None, "PG: already processed");
    require(amount > 0, "PG: amount must be > 0");
    require(tokenAddress != address(0), "PG: invalid token");
    require(recipientAddress != address(0), "PG: invalid recipient");
  }

  /**
   * @notice Try to execute ERC20 Permit, silently ignore if it fails
   * @param tokenAddress Token address
   * @param owner Token owner address
   * @param amount Approval amount
   * @param permit Permit signature (deadline=0 to skip)
   */
  function _tryPermit(
    address tokenAddress,
    address owner,
    uint256 amount,
    IPaymentGateway.PermitSignature calldata permit
  ) internal {
    if (permit.deadline > 0) {
      try
        IERC20Permit(tokenAddress).permit(
          owner,
          address(this),
          amount,
          permit.deadline,
          permit.v,
          permit.r,
          permit.s
        )
      {} catch {}
    }
  }

  /**
   * @notice Internal function to verify payment server signature
   * @param paymentId Payment identifier
   * @param tokenAddress Token address
   * @param amount Payment amount
   * @param recipientAddress Recipient address
   * @param merchantId Merchant identifier
   * @param deadline Signature deadline
   * @param escrowDuration Escrow duration in seconds
   * @param signature Server signature
   * @return True if signature is valid
   */
  function _verifyPaymentSignature(
    bytes32 paymentId,
    address tokenAddress,
    uint256 amount,
    address recipientAddress,
    bytes32 merchantId,
    uint256 deadline,
    uint256 escrowDuration,
    bytes calldata signature
  ) internal view returns (bool) {
    bytes32 structHash = keccak256(
      abi.encode(
        PAYMENT_REQUEST_TYPEHASH,
        paymentId,
        tokenAddress,
        amount,
        recipientAddress,
        merchantId,
        deadline,
        escrowDuration
      )
    );
    bytes32 hash = _hashTypedDataV4(structHash);
    address recoveredSigner = hash.recover(signature);
    return recoveredSigner == signerAddress;
  }

  /**
   * @notice Finalize an escrowed payment - release funds to merchant
   * @dev Only callable before escrowDeadline. Requires server signature.
   * @param paymentId The escrowed payment ID
   * @param serverSignature Server's EIP-712 FinalizeRequest signature
   */
  function finalize(bytes32 paymentId, bytes calldata serverSignature) external nonReentrant {
    require(paymentStatus[paymentId] == PaymentStatus.Escrowed, "PG: not escrowed");

    Payment storage p = payments[paymentId];
    require(block.timestamp <= p.escrowDeadline, "PG: escrow expired");
    require(_verifyFinalizeSignature(paymentId, serverSignature), "PG: invalid signature");

    paymentStatus[paymentId] = PaymentStatus.Finalized;

    uint256 feeAmount = (p.amount * p.feeBps) / MAX_FEE_BPS;
    uint256 recipientAmount = p.amount - feeAmount;

    if (feeAmount > 0) {
      IERC20(p.token).safeTransfer(treasuryAddress, feeAmount);
    }
    IERC20(p.token).safeTransfer(p.recipient, recipientAmount);

    emit PaymentFinalized(
      paymentId,
      p.merchantId,
      p.recipient,
      p.token,
      p.amount,
      feeAmount,
      block.timestamp
    );
  }

  /**
   * @notice Internal function to verify finalize server signature
   * @param paymentId Payment identifier
   * @param signature Server signature
   * @return True if signature is valid
   */
  function _verifyFinalizeSignature(
    bytes32 paymentId,
    bytes calldata signature
  ) internal view returns (bool) {
    bytes32 structHash = keccak256(abi.encode(FINALIZE_REQUEST_TYPEHASH, paymentId));
    bytes32 hash = _hashTypedDataV4(structHash);
    address recoveredSigner = hash.recover(signature);
    return recoveredSigner == signerAddress;
  }

  /**
   * @notice Cancel an escrowed payment - return full amount to buyer
   * @dev Before escrowDeadline: requires server signature.
   *      After escrowDeadline: permissionless (anyone can call).
   * @param paymentId The escrowed payment ID
   * @param serverSignature Server's EIP-712 CancelRequest signature (ignored after deadline)
   */
  function cancel(bytes32 paymentId, bytes calldata serverSignature) external nonReentrant {
    require(paymentStatus[paymentId] == PaymentStatus.Escrowed, "PG: not escrowed");

    Payment storage p = payments[paymentId];

    if (block.timestamp <= p.escrowDeadline) {
      require(_verifyCancelSignature(paymentId, serverSignature), "PG: invalid signature");
    }

    paymentStatus[paymentId] = PaymentStatus.Cancelled;

    IERC20(p.token).safeTransfer(p.payer, p.amount);

    emit PaymentCancelled(paymentId, p.merchantId, p.payer, p.token, p.amount, block.timestamp);
  }

  /**
   * @notice Internal function to verify cancel server signature
   * @param paymentId Payment identifier
   * @param signature Server signature
   * @return True if signature is valid
   */
  function _verifyCancelSignature(
    bytes32 paymentId,
    bytes calldata signature
  ) internal view returns (bool) {
    bytes32 structHash = keccak256(abi.encode(CANCEL_REQUEST_TYPEHASH, paymentId));
    bytes32 hash = _hashTypedDataV4(structHash);
    address recoveredSigner = hash.recover(signature);
    return recoveredSigner == signerAddress;
  }

  /**
   * @notice Set whether a token is supported
   * @dev Only callable by owner
   * @param tokenAddress The token address
   * @param supported Whether the token should be supported
   */
  function setSupportedToken(address tokenAddress, bool supported) external onlyOwner {
    require(tokenAddress != address(0), "PG: invalid token");
    supportedTokens[tokenAddress] = supported;
    emit TokenSupportChanged(tokenAddress, supported);
  }

  /**
   * @notice Set whether token whitelist is enforced
   * @dev Only callable by owner
   * @param enforce Whether to enforce the whitelist
   */
  function setEnforceTokenWhitelist(bool enforce) external onlyOwner {
    enforceTokenWhitelist = enforce;
  }

  /**
   * @notice Batch set supported tokens
   * @dev Only callable by owner, useful for initial setup
   * @param tokenAddresses Array of token addresses
   * @param supported Array of support statuses
   */
  function batchSetSupportedTokens(
    address[] calldata tokenAddresses,
    bool[] calldata supported
  ) external onlyOwner {
    require(tokenAddresses.length == supported.length, "PG: length mismatch");

    for (uint256 i = 0; i < tokenAddresses.length; ++i) {
      require(tokenAddresses[i] != address(0), "PG: invalid token");
      supportedTokens[tokenAddresses[i]] = supported[i];
      emit TokenSupportChanged(tokenAddresses[i], supported[i]);
    }
  }

  // ============ Refund Functions ============

  /**
   * @notice Refund a finalized payment - merchant sends full amount back to payer
   * @dev Only callable by original recipient (merchant) after finalization.
   *      All refund data (token, amount, payer) is read from on-chain storage.
   *      Uses _msgSender() to support both direct calls and meta-transactions
   *      Supports ERC20 Permit for gasless token approval
   * @param originalPaymentId The finalized payment ID to refund
   * @param serverSignature Server's EIP-712 signature
   * @param permit Permit signature for gasless token approval (deadline=0 to skip)
   */
  function refund(
    bytes32 originalPaymentId,
    bytes calldata serverSignature,
    IPaymentGateway.PermitSignature calldata permit
  ) external nonReentrant {
    require(paymentStatus[originalPaymentId] == PaymentStatus.Finalized, "PG: not finalized");

    Payment storage p = payments[originalPaymentId];
    address merchantAddress = _msgSender();
    require(merchantAddress == p.recipient, "PG: not recipient");

    _tryPermit(p.token, merchantAddress, p.amount, permit);
    require(_verifyRefundSignature(originalPaymentId, serverSignature), "PG: invalid signature");

    paymentStatus[originalPaymentId] = PaymentStatus.Refunded;

    IERC20(p.token).safeTransferFrom(merchantAddress, p.payer, p.amount);

    emit RefundCompleted(
      originalPaymentId,
      p.merchantId,
      p.payer,
      merchantAddress,
      p.token,
      p.amount,
      block.timestamp
    );
  }

  /**
   * @notice Internal function to verify refund server signature
   * @param originalPaymentId Original payment identifier
   * @param signature Server signature
   * @return True if signature is valid
   */
  function _verifyRefundSignature(
    bytes32 originalPaymentId,
    bytes calldata signature
  ) internal view returns (bool) {
    bytes32 structHash = keccak256(abi.encode(REFUND_REQUEST_TYPEHASH, originalPaymentId));
    bytes32 hash = _hashTypedDataV4(structHash);
    address recoveredSigner = hash.recover(signature);
    return recoveredSigner == signerAddress;
  }

  /**
   * @notice Check if a payment has been refunded
   * @param paymentId The payment ID to check
   * @return True if the payment has been refunded
   */
  function isPaymentRefunded(bytes32 paymentId) external view returns (bool) {
    return paymentStatus[paymentId] == PaymentStatus.Refunded;
  }

  // ============ View Functions ============

  /**
   * @notice Check if a payment ID has been used
   * @param paymentId The payment ID to check
   * @return True if the payment has been processed
   */
  function isPaymentProcessed(bytes32 paymentId) external view returns (bool) {
    return paymentStatus[paymentId] != PaymentStatus.None;
  }

  /**
   * @notice Get payment data by paymentId
   * @param paymentId The payment ID to query
   * @return The Payment struct
   */
  function getPayment(bytes32 paymentId) external view returns (Payment memory) {
    return payments[paymentId];
  }

  /**
   * @notice Get the trusted forwarder address
   * @return Address of the trusted forwarder
   */
  function getTrustedForwarder() external view returns (address) {
    return trustedForwarder();
  }

  /**
   * @notice Get the EIP-712 domain separator
   * @return The domain separator
   */
  function getDomainSeparator() external view returns (bytes32) {
    return _domainSeparatorV4();
  }

  // ============ ERC2771 Overrides ============

  /**
   * @notice Get the message sender address
   * @dev Override _msgSender to support meta-transactions
   * @return The sender address (original sender in meta-tx)
   */
  function _msgSender()
    internal
    view
    override(ContextUpgradeable, ERC2771ContextUpgradeable)
    returns (address)
  {
    return ERC2771ContextUpgradeable._msgSender();
  }

  /**
   * @notice Get the message data
   * @dev Override _msgData to support meta-transactions
   * @return The message data (stripped of suffix in meta-tx)
   */
  function _msgData()
    internal
    view
    override(ContextUpgradeable, ERC2771ContextUpgradeable)
    returns (bytes calldata)
  {
    return ERC2771ContextUpgradeable._msgData();
  }

  /**
   * @notice Get the context suffix length
   * @dev Override _contextSuffixLength for ERC2771
   * @return The context suffix length
   */
  function _contextSuffixLength()
    internal
    view
    override(ContextUpgradeable, ERC2771ContextUpgradeable)
    returns (uint256)
  {
    return ERC2771ContextUpgradeable._contextSuffixLength();
  }

  // ============ UUPS Override ============

  /**
   * @notice Authorize contract upgrade
   * @dev Only callable by owner
   * @param newImplementation Address of the new implementation contract
   */
  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
