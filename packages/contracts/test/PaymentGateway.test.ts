import { expect } from 'chai';
import { ethers, upgrades } from 'hardhat';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import type { PaymentGatewayV1, MockERC20, ERC2771Forwarder } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

// Zero permit for skipping permit (using traditional approve)
const ZERO_PERMIT = {
  deadline: 0n,
  v: 0,
  r: ethers.ZeroHash,
  s: ethers.ZeroHash,
};

// Default escrow duration for tests (1 day)
const ESCROW_DURATION = 86400;

// PaymentStatus enum values matching contract
const Status = {
  None: 0n,
  Escrowed: 1n,
  Finalized: 2n,
  Cancelled: 3n,
  Refunded: 4n,
};

describe('PaymentGatewayV1', function () {
  const paymentDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

  // Helper: create server signature (includes escrowDuration)
  async function createServerSignature(
    signer: HardhatEthersSigner,
    gateway: PaymentGatewayV1,
    paymentId: string,
    tokenAddress: string,
    amount: bigint,
    recipientAddress: string,
    merchantId: string,
    feeBps: number,
    deadline: bigint,
    escrowDuration: number
  ) {
    const domain = {
      name: 'SoloPayGateway',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await gateway.getAddress(),
    };

    const types = {
      PaymentRequest: [
        { name: 'paymentId', type: 'bytes32' },
        { name: 'tokenAddress', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'recipientAddress', type: 'address' },
        { name: 'merchantId', type: 'bytes32' },
        { name: 'feeBps', type: 'uint16' },
        { name: 'deadline', type: 'uint256' },
        { name: 'escrowDuration', type: 'uint256' },
      ],
    };

    const message = {
      paymentId,
      tokenAddress,
      amount,
      recipientAddress,
      merchantId,
      feeBps,
      deadline,
      escrowDuration,
    };

    return signer.signTypedData(domain, types, message);
  }

  // Helper: create FinalizeRequest signature
  async function createFinalizeSignature(
    signer: HardhatEthersSigner,
    gateway: PaymentGatewayV1,
    paymentId: string
  ) {
    const domain = {
      name: 'SoloPayGateway',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await gateway.getAddress(),
    };

    const types = {
      FinalizeRequest: [{ name: 'paymentId', type: 'bytes32' }],
    };

    return signer.signTypedData(domain, types, { paymentId });
  }

  // Helper: create CancelRequest signature
  async function createCancelSignature(
    signer: HardhatEthersSigner,
    gateway: PaymentGatewayV1,
    paymentId: string
  ) {
    const domain = {
      name: 'SoloPayGateway',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await gateway.getAddress(),
    };

    const types = {
      CancelRequest: [{ name: 'paymentId', type: 'bytes32' }],
    };

    return signer.signTypedData(domain, types, { paymentId });
  }

  // Helper: create refund server signature
  async function createRefundSignature(
    signer: HardhatEthersSigner,
    gateway: PaymentGatewayV1,
    originalPaymentId: string,
    tokenAddress: string,
    amount: bigint,
    payerAddress: string,
    merchantId: string
  ) {
    const domain = {
      name: 'SoloPayGateway',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await gateway.getAddress(),
    };

    const types = {
      RefundRequest: [
        { name: 'originalPaymentId', type: 'bytes32' },
        { name: 'tokenAddress', type: 'address' },
        { name: 'amount', type: 'uint256' },
        { name: 'payerAddress', type: 'address' },
        { name: 'merchantId', type: 'bytes32' },
      ],
    };

    const message = {
      originalPaymentId,
      tokenAddress,
      amount,
      payerAddress,
      merchantId,
    };

    return signer.signTypedData(domain, types, message);
  }

  // Helper: create ERC20 Permit signature
  async function createPermitSignature(
    token: MockERC20,
    owner: HardhatEthersSigner,
    spender: string,
    value: bigint,
    deadline: bigint
  ) {
    const nonce = await token.nonces(owner.address);
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const tokenAddress = await token.getAddress();
    const name = await token.name();

    const domain = {
      name,
      version: '1',
      chainId,
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
      owner: owner.address,
      spender,
      value,
      nonce,
      deadline,
    };

    const signature = await owner.signTypedData(domain, types, message);
    const sig = ethers.Signature.from(signature);

    return {
      deadline,
      v: sig.v,
      r: sig.r,
      s: sig.s,
    };
  }

  // Test fixture: deploy contracts
  async function deployFixture() {
    const [owner, treasury, payer, other, signer, merchantRecipient] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory('MockERC20');
    const token = (await MockToken.deploy('Test Token', 'TEST', 18)) as unknown as MockERC20;
    await token.waitForDeployment();

    const mintAmount = ethers.parseEther('10000');
    await token.mint(payer.address, mintAmount);

    const Forwarder = await ethers.getContractFactory('ERC2771Forwarder');
    const forwarder = (await Forwarder.deploy('SoloForwarder')) as unknown as ERC2771Forwarder;
    await forwarder.waitForDeployment();

    const PaymentGateway = await ethers.getContractFactory('PaymentGatewayV1');
    const gateway = (await upgrades.deployProxy(
      PaymentGateway,
      [owner.address, treasury.address, signer.address],
      {
        kind: 'uups',
        initializer: 'initialize',
        constructorArgs: [await forwarder.getAddress()],
      }
    )) as unknown as PaymentGatewayV1;
    await gateway.waitForDeployment();

    const merchantId = ethers.id('MERCHANT_001');

    return {
      gateway,
      forwarder,
      token,
      owner,
      treasury,
      payer,
      other,
      signer,
      merchantRecipient,
      merchantId,
    };
  }

  // Helper fixture: make an escrowed payment (for finalize/cancel tests)
  async function makePaymentFixture() {
    const fixture = await loadFixture(deployFixture);
    const { gateway, token, payer, signer, merchantRecipient, merchantId } = fixture;

    const paymentId = ethers.id('ESCROW_PAYMENT_001');
    const amount = ethers.parseEther('100');
    const feeBps = 500; // 5%

    const signature = await createServerSignature(
      signer,
      gateway,
      paymentId,
      await token.getAddress(),
      amount,
      merchantRecipient.address,
      merchantId,
      feeBps,
      paymentDeadline,
      ESCROW_DURATION
    );

    await token.connect(payer).approve(await gateway.getAddress(), amount);

    await gateway
      .connect(payer)
      .pay(
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION,
        signature,
        ZERO_PERMIT
      );

    return { ...fixture, paymentId, amount, feeBps };
  }

  // Helper fixture: make a finalized payment (for refund tests)
  async function makeFinalizedPaymentFixture() {
    const fixture = await loadFixture(deployFixture);
    const { gateway, token, payer, signer, merchantRecipient, merchantId } = fixture;

    const paymentId = ethers.id('FINALIZED_PAYMENT_001');
    const amount = ethers.parseEther('100');
    const feeBps = 0; // no fee for simplicity

    const signature = await createServerSignature(
      signer,
      gateway,
      paymentId,
      await token.getAddress(),
      amount,
      merchantRecipient.address,
      merchantId,
      feeBps,
      paymentDeadline,
      ESCROW_DURATION
    );

    await token.connect(payer).approve(await gateway.getAddress(), amount);

    await gateway
      .connect(payer)
      .pay(
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION,
        signature,
        ZERO_PERMIT
      );

    // Finalize the payment
    const finalizeSignature = await createFinalizeSignature(signer, gateway, paymentId);
    await gateway.finalize(paymentId, finalizeSignature);

    return { ...fixture, paymentId, amount, feeBps };
  }

  // ============ Deployment ============

  describe('Deployment', function () {
    it('Should set the correct owner', async function () {
      const { gateway, owner } = await loadFixture(deployFixture);
      expect(await gateway.owner()).to.equal(owner.address);
    });

    it('Should set the correct trusted forwarder', async function () {
      const { gateway, forwarder } = await loadFixture(deployFixture);
      expect(await gateway.getTrustedForwarder()).to.equal(await forwarder.getAddress());
    });

    it('Should not enforce token whitelist by default', async function () {
      const { gateway } = await loadFixture(deployFixture);
      expect(await gateway.enforceTokenWhitelist()).to.equal(false);
    });

    it('Should set the correct server signer', async function () {
      const { gateway, signer } = await loadFixture(deployFixture);
      expect(await gateway.signerAddress()).to.equal(signer.address);
    });
  });

  // ============ Payment (Escrow Creation) ============

  describe('Payment', function () {
    it('Should create escrow correctly (tokens held in contract, event emitted, status set)', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('ORDER_001');
      const amount = ethers.parseEther('100');
      const feeBps = 0;

      const signature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      await token.connect(payer).approve(await gateway.getAddress(), amount);

      const payerBalanceBefore = await token.balanceOf(payer.address);
      const contractBalanceBefore = await token.balanceOf(await gateway.getAddress());

      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            await token.getAddress(),
            amount,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            ESCROW_DURATION,
            signature,
            ZERO_PERMIT
          )
      )
        .to.emit(gateway, 'PaymentEscrowed')
        .withArgs(
          paymentId,
          merchantId,
          payer.address,
          merchantRecipient.address,
          await token.getAddress(),
          amount,
          (escrowDeadline: bigint) => escrowDeadline > 0n,
          (timestamp: bigint) => timestamp > 0n
        );

      // Tokens should be held in the contract (escrow)
      expect(await token.balanceOf(payer.address)).to.equal(payerBalanceBefore - amount);
      expect(await token.balanceOf(await gateway.getAddress())).to.equal(
        contractBalanceBefore + amount
      );
      // Recipient should NOT have tokens yet
      expect(await token.balanceOf(merchantRecipient.address)).to.equal(0n);

      // Payment status should be Escrowed
      expect(await gateway.paymentStatus(paymentId)).to.equal(Status.Escrowed);
      expect(await gateway.isPaymentProcessed(paymentId)).to.equal(true);

      // Payment struct should be populated
      const payment = await gateway.getPayment(paymentId);
      expect(payment.payer).to.equal(payer.address);
      expect(payment.token).to.equal(await token.getAddress());
      expect(payment.amount).to.equal(amount);
      expect(payment.recipient).to.equal(merchantRecipient.address);
      expect(payment.merchantId).to.equal(merchantId);
      expect(payment.feeBps).to.equal(feeBps);
      expect(payment.escrowDeadline).to.be.gt(0n);
    });

    it('Should reject duplicate payment ID', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('ORDER_002');
      const amount = ethers.parseEther('50');
      const feeBps = 0;

      const signature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      await token.connect(payer).approve(await gateway.getAddress(), amount * 2n);

      // First payment
      await gateway
        .connect(payer)
        .pay(
          paymentId,
          await token.getAddress(),
          amount,
          merchantRecipient.address,
          merchantId,
          feeBps,
          paymentDeadline,
          ESCROW_DURATION,
          signature,
          ZERO_PERMIT
        );

      // Second payment with same ID should fail
      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            await token.getAddress(),
            amount,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            ESCROW_DURATION,
            signature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: already processed');
    });

    it('Should reject zero amount', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('ORDER_003');
      const feeBps = 0;

      const signature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        0n,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            await token.getAddress(),
            0,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            ESCROW_DURATION,
            signature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: amount must be > 0');
    });

    it('Should reject zero token address', async function () {
      const { gateway, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('ORDER_005');
      const amount = ethers.parseEther('10');
      const feeBps = 0;

      const signature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        ethers.ZeroAddress,
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            ethers.ZeroAddress,
            amount,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            ESCROW_DURATION,
            signature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: invalid token');
    });

    it('Should reject invalid signature', async function () {
      const { gateway, token, payer, other, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('ORDER_INVALID_SIG');
      const amount = ethers.parseEther('10');
      const feeBps = 0;

      // Sign with wrong signer (other instead of signer)
      const signature = await createServerSignature(
        other,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      await token.connect(payer).approve(await gateway.getAddress(), amount);

      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            await token.getAddress(),
            amount,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            ESCROW_DURATION,
            signature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: invalid signature');
    });

    it('Should reject fee over 100%', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('ORDER_HIGH_FEE');
      const amount = ethers.parseEther('10');
      const feeBps = 10001; // Over 100%

      const signature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      await token.connect(payer).approve(await gateway.getAddress(), amount);

      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            await token.getAddress(),
            amount,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            ESCROW_DURATION,
            signature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: fee too high');
    });

    it('Should reject zero escrowDuration', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('ESCROW_ZERO_DURATION');
      const amount = ethers.parseEther('10');
      const feeBps = 0;

      const signature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        0 // zero escrowDuration
      );

      await token.connect(payer).approve(await gateway.getAddress(), amount);

      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            await token.getAddress(),
            amount,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            0,
            signature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: invalid escrowDuration');
    });

    it('Should reject escrowDuration exceeding MAX_ESCROW_DURATION', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('ESCROW_LONG_DURATION');
      const amount = ethers.parseEther('10');
      const feeBps = 0;
      const tooLongDuration = 2592001; // MAX_ESCROW_DURATION + 1

      const signature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        tooLongDuration
      );

      await token.connect(payer).approve(await gateway.getAddress(), amount);

      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            await token.getAddress(),
            amount,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            tooLongDuration,
            signature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: invalid escrowDuration');
    });
  });

  // ============ Finalize ============

  describe('Finalize', function () {
    it('Should finalize escrow: fee to treasury, remainder to recipient, event emitted', async function () {
      const {
        gateway,
        token,
        treasury,
        merchantRecipient,
        signer,
        merchantId,
        paymentId,
        amount,
        feeBps,
      } = await makePaymentFixture();

      const finalizeSignature = await createFinalizeSignature(signer, gateway, paymentId);

      const expectedFee = (amount * BigInt(feeBps)) / 10000n;
      const expectedRecipientAmount = amount - expectedFee;

      const treasuryBalanceBefore = await token.balanceOf(treasury.address);
      const recipientBalanceBefore = await token.balanceOf(merchantRecipient.address);
      const contractBalanceBefore = await token.balanceOf(await gateway.getAddress());

      await expect(gateway.finalize(paymentId, finalizeSignature))
        .to.emit(gateway, 'PaymentFinalized')
        .withArgs(
          paymentId,
          merchantId,
          merchantRecipient.address,
          await token.getAddress(),
          amount,
          expectedFee,
          (timestamp: bigint) => timestamp > 0n
        );

      // Verify balances
      expect(await token.balanceOf(treasury.address)).to.equal(treasuryBalanceBefore + expectedFee);
      expect(await token.balanceOf(merchantRecipient.address)).to.equal(
        recipientBalanceBefore + expectedRecipientAmount
      );
      expect(await token.balanceOf(await gateway.getAddress())).to.equal(
        contractBalanceBefore - amount
      );

      // Verify status
      expect(await gateway.paymentStatus(paymentId)).to.equal(Status.Finalized);
    });

    it('Should revert after deadline expired', async function () {
      const { gateway, signer, paymentId } = await makePaymentFixture();

      // Advance time past the escrow deadline
      await time.increase(ESCROW_DURATION + 1);

      const finalizeSignature = await createFinalizeSignature(signer, gateway, paymentId);

      await expect(gateway.finalize(paymentId, finalizeSignature)).to.be.revertedWith(
        'PG: escrow expired'
      );
    });

    it('Should revert with invalid signature', async function () {
      const { gateway, other, paymentId } = await makePaymentFixture();

      // Sign with wrong signer
      const invalidSignature = await createFinalizeSignature(other, gateway, paymentId);

      await expect(gateway.finalize(paymentId, invalidSignature)).to.be.revertedWith(
        'PG: invalid signature'
      );
    });

    it('Should revert on already finalized escrow', async function () {
      const { gateway, signer, paymentId } = await makePaymentFixture();

      const finalizeSignature = await createFinalizeSignature(signer, gateway, paymentId);

      // Finalize first time
      await gateway.finalize(paymentId, finalizeSignature);

      // Try to finalize again
      await expect(gateway.finalize(paymentId, finalizeSignature)).to.be.revertedWith(
        'PG: not escrowed'
      );
    });

    it('Should revert on cancelled escrow', async function () {
      const { gateway, signer, paymentId } = await makePaymentFixture();

      // Cancel first
      const cancelSignature = await createCancelSignature(signer, gateway, paymentId);
      await gateway.cancel(paymentId, cancelSignature);

      // Try to finalize
      const finalizeSignature = await createFinalizeSignature(signer, gateway, paymentId);
      await expect(gateway.finalize(paymentId, finalizeSignature)).to.be.revertedWith(
        'PG: not escrowed'
      );
    });
  });

  // ============ Cancel ============

  describe('Cancel', function () {
    it('Should cancel with server signature before deadline: refund to payer, event emitted', async function () {
      const { gateway, token, payer, signer, merchantId, paymentId, amount } =
        await makePaymentFixture();

      const cancelSignature = await createCancelSignature(signer, gateway, paymentId);

      const payerBalanceBefore = await token.balanceOf(payer.address);
      const contractBalanceBefore = await token.balanceOf(await gateway.getAddress());

      await expect(gateway.cancel(paymentId, cancelSignature))
        .to.emit(gateway, 'PaymentCancelled')
        .withArgs(
          paymentId,
          merchantId,
          payer.address,
          await token.getAddress(),
          amount,
          (timestamp: bigint) => timestamp > 0n
        );

      // Payer should get full refund
      expect(await token.balanceOf(payer.address)).to.equal(payerBalanceBefore + amount);

      // Contract balance should decrease by amount
      expect(await token.balanceOf(await gateway.getAddress())).to.equal(
        contractBalanceBefore - amount
      );

      // Status should be Cancelled
      expect(await gateway.paymentStatus(paymentId)).to.equal(Status.Cancelled);
    });

    it('Should allow permissionless cancel after deadline expired', async function () {
      const { gateway, token, payer, other, paymentId, amount } = await makePaymentFixture();

      // Advance time past the escrow deadline
      await time.increase(ESCROW_DURATION + 1);

      const payerBalanceBefore = await token.balanceOf(payer.address);
      const contractBalanceBefore = await token.balanceOf(await gateway.getAddress());

      // Anyone can cancel after deadline with empty signature
      await expect(gateway.connect(other).cancel(paymentId, '0x')).to.emit(
        gateway,
        'PaymentCancelled'
      );

      expect(await token.balanceOf(payer.address)).to.equal(payerBalanceBefore + amount);
      expect(await token.balanceOf(await gateway.getAddress())).to.equal(
        contractBalanceBefore - amount
      );

      expect(await gateway.paymentStatus(paymentId)).to.equal(Status.Cancelled);
    });

    it('Should revert with invalid signature before deadline', async function () {
      const { gateway, other, paymentId } = await makePaymentFixture();

      // Sign with wrong signer
      const invalidSignature = await createCancelSignature(other, gateway, paymentId);

      await expect(gateway.cancel(paymentId, invalidSignature)).to.be.revertedWith(
        'PG: invalid signature'
      );
    });

    it('Should revert on already cancelled escrow', async function () {
      const { gateway, signer, paymentId } = await makePaymentFixture();

      const cancelSignature = await createCancelSignature(signer, gateway, paymentId);

      // Cancel first time
      await gateway.cancel(paymentId, cancelSignature);

      // Try to cancel again
      await expect(gateway.cancel(paymentId, cancelSignature)).to.be.revertedWith(
        'PG: not escrowed'
      );
    });

    it('Should revert on finalized escrow', async function () {
      const { gateway, signer, paymentId } = await makePaymentFixture();

      // Finalize first
      const finalizeSignature = await createFinalizeSignature(signer, gateway, paymentId);
      await gateway.finalize(paymentId, finalizeSignature);

      // Try to cancel
      const cancelSignature = await createCancelSignature(signer, gateway, paymentId);
      await expect(gateway.cancel(paymentId, cancelSignature)).to.be.revertedWith(
        'PG: not escrowed'
      );
    });
  });

  // ============ Fee Mechanism ============

  describe('Fee Mechanism', function () {
    it('Should split payment on finalize: fee to treasury, rest to recipient', async function () {
      const { gateway, token, treasury, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const feeBps = 500; // 5%
      const paymentId = ethers.id('FEE_ORDER_001');
      const amount = ethers.parseEther('100');

      const signature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      await token.connect(payer).approve(await gateway.getAddress(), amount);

      // Pay into escrow
      await gateway
        .connect(payer)
        .pay(
          paymentId,
          await token.getAddress(),
          amount,
          merchantRecipient.address,
          merchantId,
          feeBps,
          paymentDeadline,
          ESCROW_DURATION,
          signature,
          ZERO_PERMIT
        );

      // Finalize to release funds with fee split
      const finalizeSignature = await createFinalizeSignature(signer, gateway, paymentId);

      const expectedFee = (amount * BigInt(feeBps)) / 10000n;
      const expectedRecipientAmount = amount - expectedFee;

      await expect(gateway.finalize(paymentId, finalizeSignature))
        .to.emit(gateway, 'PaymentFinalized')
        .withArgs(
          paymentId,
          merchantId,
          merchantRecipient.address,
          await token.getAddress(),
          amount,
          expectedFee,
          (timestamp: bigint) => timestamp > 0n
        );

      // Fee goes to treasury, rest to recipient
      expect(await token.balanceOf(treasury.address)).to.equal(expectedFee);
      expect(await token.balanceOf(merchantRecipient.address)).to.equal(expectedRecipientAmount);
    });

    it('Should have zero fee when feeBps is 0', async function () {
      const { gateway, token, treasury, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('NO_FEE_ORDER');
      const amount = ethers.parseEther('100');
      const feeBps = 0;

      const signature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      await token.connect(payer).approve(await gateway.getAddress(), amount);

      await gateway
        .connect(payer)
        .pay(
          paymentId,
          await token.getAddress(),
          amount,
          merchantRecipient.address,
          merchantId,
          feeBps,
          paymentDeadline,
          ESCROW_DURATION,
          signature,
          ZERO_PERMIT
        );

      // Finalize
      const finalizeSignature = await createFinalizeSignature(signer, gateway, paymentId);
      await gateway.finalize(paymentId, finalizeSignature);

      // Full amount goes to recipient, nothing to treasury
      expect(await token.balanceOf(merchantRecipient.address)).to.equal(amount);
      expect(await token.balanceOf(treasury.address)).to.equal(0n);
    });

    it('Should handle maximum fee (10000 bps = 100%) correctly', async function () {
      const { gateway, token, payer, treasury, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('MAX_FEE_ORDER');
      const amount = ethers.parseEther('100');
      const feeBps = 10000; // 100%

      const signature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      await token.connect(payer).approve(await gateway.getAddress(), amount);

      await gateway
        .connect(payer)
        .pay(
          paymentId,
          await token.getAddress(),
          amount,
          merchantRecipient.address,
          merchantId,
          feeBps,
          paymentDeadline,
          ESCROW_DURATION,
          signature,
          ZERO_PERMIT
        );

      const finalizeSignature = await createFinalizeSignature(signer, gateway, paymentId);
      await gateway.finalize(paymentId, finalizeSignature);

      // All fee to treasury, nothing to recipient
      expect(await token.balanceOf(treasury.address)).to.equal(amount);
      expect(await token.balanceOf(merchantRecipient.address)).to.equal(0n);
    });
  });

  // ============ Token Whitelist ============

  describe('Token Whitelist', function () {
    it('Should allow owner to set supported token', async function () {
      const { gateway, token, owner } = await loadFixture(deployFixture);

      await expect(gateway.connect(owner).setSupportedToken(await token.getAddress(), true))
        .to.emit(gateway, 'TokenSupportChanged')
        .withArgs(await token.getAddress(), true);

      expect(await gateway.supportedTokens(await token.getAddress())).to.equal(true);
    });

    it('Should reject non-owner setting supported token', async function () {
      const { gateway, token, other } = await loadFixture(deployFixture);

      await expect(
        gateway.connect(other).setSupportedToken(await token.getAddress(), true)
      ).to.be.revertedWithCustomError(gateway, 'OwnableUnauthorizedAccount');
    });

    it('Should enforce whitelist when enabled', async function () {
      const { gateway, token, payer, owner, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      // Enable whitelist enforcement
      await gateway.connect(owner).setEnforceTokenWhitelist(true);

      const paymentId = ethers.id('ORDER_006');
      const amount = ethers.parseEther('10');
      const feeBps = 0;

      const signature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      await token.connect(payer).approve(await gateway.getAddress(), amount);

      // Should fail - token not whitelisted
      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            await token.getAddress(),
            amount,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            ESCROW_DURATION,
            signature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: token not supported');

      // Add token to whitelist
      await gateway.connect(owner).setSupportedToken(await token.getAddress(), true);

      // Now should succeed
      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            await token.getAddress(),
            amount,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            ESCROW_DURATION,
            signature,
            ZERO_PERMIT
          )
      ).to.emit(gateway, 'PaymentEscrowed');
    });

    it('Should batch set supported tokens', async function () {
      const { gateway, token, owner } = await loadFixture(deployFixture);

      const tokens = [await token.getAddress(), ethers.Wallet.createRandom().address];
      const supported = [true, true];

      await gateway.connect(owner).batchSetSupportedTokens(tokens, supported);

      expect(await gateway.supportedTokens(tokens[0])).to.equal(true);
      expect(await gateway.supportedTokens(tokens[1])).to.equal(true);
    });
  });

  // ============ Meta Transaction ============

  describe('Meta Transaction', function () {
    it('Should process meta-transaction payment via forwarder', async function () {
      const { gateway, forwarder, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('META_ORDER_001');
      const amount = ethers.parseEther('25');
      const feeBps = 0;

      // Create server signature
      const serverSignature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      // Approve token spending
      await token.connect(payer).approve(await gateway.getAddress(), amount);

      // Encode the pay function call (single pay, no overload disambiguation needed)
      const data = gateway.interface.encodeFunctionData('pay', [
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION,
        serverSignature,
        ZERO_PERMIT,
      ]);

      // Get nonce for payer (OZ v5 format)
      const nonce = await forwarder.nonces(payer.address);
      const forwarderDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Sign the request using EIP-712 (OZ v5 format)
      const domain = {
        name: 'SoloForwarder',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await forwarder.getAddress(),
      };

      const types = {
        ForwardRequest: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'gas', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint48' },
          { name: 'data', type: 'bytes' },
        ],
      };

      const message = {
        from: payer.address,
        to: await gateway.getAddress(),
        value: 0n,
        gas: 500000n,
        nonce: nonce,
        deadline: forwarderDeadline,
        data: data,
      };

      const forwarderSignature = await payer.signTypedData(domain, types, message);

      // OZ v5 ForwardRequestData struct (includes signature, excludes nonce)
      const requestData = {
        from: payer.address,
        to: await gateway.getAddress(),
        value: 0n,
        gas: 500000n,
        deadline: forwarderDeadline,
        data: data,
        signature: forwarderSignature,
      };

      // Execute via forwarder (anyone can submit)
      await expect(forwarder.execute(requestData)).to.emit(gateway, 'PaymentEscrowed');

      expect(await gateway.isPaymentProcessed(paymentId)).to.equal(true);
      expect(await gateway.paymentStatus(paymentId)).to.equal(Status.Escrowed);

      // Tokens should be held in contract (escrow)
      expect(await token.balanceOf(await gateway.getAddress())).to.equal(amount);
    });
  });

  // ============ Upgrade ============

  describe('Upgrade', function () {
    it('Should allow owner to upgrade', async function () {
      const { gateway, forwarder } = await loadFixture(deployFixture);

      const PaymentGatewayV2 = await ethers.getContractFactory('PaymentGatewayV1');

      await expect(
        upgrades.upgradeProxy(await gateway.getAddress(), PaymentGatewayV2, {
          kind: 'uups',
          constructorArgs: [await forwarder.getAddress()],
        })
      ).to.not.be.reverted;
    });

    it('Should reject non-owner upgrade', async function () {
      const { gateway, forwarder, other } = await loadFixture(deployFixture);

      const PaymentGatewayV2 = await ethers.getContractFactory('PaymentGatewayV1', other);

      await expect(
        upgrades.upgradeProxy(await gateway.getAddress(), PaymentGatewayV2, {
          kind: 'uups',
          constructorArgs: [await forwarder.getAddress()],
        })
      ).to.be.revertedWithCustomError(gateway, 'OwnableUnauthorizedAccount');
    });
  });

  // ============ View Functions ============

  describe('View Functions', function () {
    it('Should return correct payment status', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('VIEW_ORDER_001');
      const amount = ethers.parseEther('10');
      const feeBps = 0;

      expect(await gateway.isPaymentProcessed(paymentId)).to.equal(false);
      expect(await gateway.paymentStatus(paymentId)).to.equal(Status.None);

      const signature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      await token.connect(payer).approve(await gateway.getAddress(), amount);
      await gateway
        .connect(payer)
        .pay(
          paymentId,
          await token.getAddress(),
          amount,
          merchantRecipient.address,
          merchantId,
          feeBps,
          paymentDeadline,
          ESCROW_DURATION,
          signature,
          ZERO_PERMIT
        );

      expect(await gateway.isPaymentProcessed(paymentId)).to.equal(true);
      expect(await gateway.paymentStatus(paymentId)).to.equal(Status.Escrowed);
    });

    it('Should return correct payment data via getPayment', async function () {
      const { gateway, token, payer, merchantRecipient, merchantId, paymentId, amount, feeBps } =
        await makePaymentFixture();

      const payment = await gateway.getPayment(paymentId);

      expect(payment.payer).to.equal(payer.address);
      expect(payment.token).to.equal(await token.getAddress());
      expect(payment.amount).to.equal(amount);
      expect(payment.recipient).to.equal(merchantRecipient.address);
      expect(payment.merchantId).to.equal(merchantId);
      expect(payment.feeBps).to.equal(feeBps);
      expect(payment.escrowDeadline).to.be.gt(0n);
    });

    it('Should return empty payment for non-existent ID', async function () {
      const { gateway } = await loadFixture(deployFixture);

      const nonExistentId = ethers.id('NON_EXISTENT');
      const payment = await gateway.getPayment(nonExistentId);

      expect(payment.payer).to.equal(ethers.ZeroAddress);
      expect(payment.amount).to.equal(0n);
    });

    it('Should return treasury address', async function () {
      const { gateway, treasury } = await loadFixture(deployFixture);

      expect(await gateway.treasuryAddress()).to.equal(treasury.address);
    });
  });

  // ============ Admin Functions ============

  describe('Admin Functions', function () {
    it('Should allow owner to set server signer', async function () {
      const { gateway, owner } = await loadFixture(deployFixture);

      const newSigner = ethers.Wallet.createRandom().address;

      await expect(gateway.connect(owner).setSigner(newSigner))
        .to.emit(gateway, 'SignerChanged')
        .withArgs(await gateway.signerAddress(), newSigner);

      expect(await gateway.signerAddress()).to.equal(newSigner);
    });

    it('Should reject non-owner setting server signer', async function () {
      const { gateway, other } = await loadFixture(deployFixture);

      await expect(
        gateway.connect(other).setSigner(ethers.Wallet.createRandom().address)
      ).to.be.revertedWithCustomError(gateway, 'OwnableUnauthorizedAccount');
    });

    it('Should reject zero address as server signer', async function () {
      const { gateway, owner } = await loadFixture(deployFixture);

      await expect(gateway.connect(owner).setSigner(ethers.ZeroAddress)).to.be.revertedWith(
        'PG: invalid signer'
      );
    });

    it('Should allow owner to set treasury', async function () {
      const { gateway, owner } = await loadFixture(deployFixture);

      const newTreasury = ethers.Wallet.createRandom().address;

      await expect(gateway.connect(owner).setTreasury(newTreasury))
        .to.emit(gateway, 'TreasuryChanged')
        .withArgs(await gateway.treasuryAddress(), newTreasury);

      expect(await gateway.treasuryAddress()).to.equal(newTreasury);
    });

    it('Should reject zero address as treasury', async function () {
      const { gateway, owner } = await loadFixture(deployFixture);

      await expect(gateway.connect(owner).setTreasury(ethers.ZeroAddress)).to.be.revertedWith(
        'PG: invalid treasury'
      );
    });
  });

  // ============ Refund ============

  describe('Refund', function () {
    it('Should process refund successfully', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId, paymentId, amount } =
        await makeFinalizedPaymentFixture();

      // Merchant approves the gateway for refund
      await token.connect(merchantRecipient).approve(await gateway.getAddress(), amount);

      const refundSignature = await createRefundSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        payer.address,
        merchantId
      );

      const payerBalanceBefore = await token.balanceOf(payer.address);

      await expect(
        gateway
          .connect(merchantRecipient)
          .refund(
            paymentId,
            await token.getAddress(),
            amount,
            payer.address,
            merchantId,
            refundSignature,
            ZERO_PERMIT
          )
      )
        .to.emit(gateway, 'RefundCompleted')
        .withArgs(
          paymentId,
          merchantId,
          payer.address,
          merchantRecipient.address,
          await token.getAddress(),
          amount,
          (timestamp: bigint) => timestamp > 0n
        );

      // Verify refund status
      expect(await gateway.paymentStatus(paymentId)).to.equal(Status.Refunded);
      expect(await gateway.isPaymentRefunded(paymentId)).to.equal(true);

      // Verify payer received tokens back
      const payerBalanceAfter = await token.balanceOf(payer.address);
      expect(payerBalanceAfter - payerBalanceBefore).to.equal(amount);
    });

    it('Should reject refund for non-existent payment', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const nonExistentPaymentId = ethers.id('NON_EXISTENT_PAYMENT');
      const amount = ethers.parseEther('100');

      const refundSignature = await createRefundSignature(
        signer,
        gateway,
        nonExistentPaymentId,
        await token.getAddress(),
        amount,
        payer.address,
        merchantId
      );

      await expect(
        gateway
          .connect(merchantRecipient)
          .refund(
            nonExistentPaymentId,
            await token.getAddress(),
            amount,
            payer.address,
            merchantId,
            refundSignature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: not finalized');
    });

    it('Should reject refund for escrowed (not finalized) payment', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId, paymentId, amount } =
        await makePaymentFixture();

      const refundSignature = await createRefundSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        payer.address,
        merchantId
      );

      await token.mint(merchantRecipient.address, amount);
      await token.connect(merchantRecipient).approve(await gateway.getAddress(), amount);

      await expect(
        gateway
          .connect(merchantRecipient)
          .refund(
            paymentId,
            await token.getAddress(),
            amount,
            payer.address,
            merchantId,
            refundSignature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: not finalized');
    });

    it('Should reject duplicate refund', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId, paymentId, amount } =
        await makeFinalizedPaymentFixture();

      // Mint extra tokens to merchant for second refund attempt
      await token.mint(merchantRecipient.address, amount);
      await token.connect(merchantRecipient).approve(await gateway.getAddress(), amount * 2n);

      const refundSignature = await createRefundSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        payer.address,
        merchantId
      );

      // First refund should succeed
      await gateway
        .connect(merchantRecipient)
        .refund(
          paymentId,
          await token.getAddress(),
          amount,
          payer.address,
          merchantId,
          refundSignature,
          ZERO_PERMIT
        );

      // Second refund should fail (status is now Refunded, not Finalized)
      await expect(
        gateway
          .connect(merchantRecipient)
          .refund(
            paymentId,
            await token.getAddress(),
            amount,
            payer.address,
            merchantId,
            refundSignature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: not finalized');
    });

    it('Should reject refund with invalid signature', async function () {
      const { gateway, token, payer, other, merchantRecipient, merchantId, paymentId, amount } =
        await makeFinalizedPaymentFixture();

      await token.connect(merchantRecipient).approve(await gateway.getAddress(), amount);

      // Sign with wrong signer
      const refundSignature = await createRefundSignature(
        other,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        payer.address,
        merchantId
      );

      await expect(
        gateway
          .connect(merchantRecipient)
          .refund(
            paymentId,
            await token.getAddress(),
            amount,
            payer.address,
            merchantId,
            refundSignature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: invalid signature');
    });

    it('Should reject refund with zero amount', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId, paymentId } =
        await makeFinalizedPaymentFixture();

      const refundSignature = await createRefundSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        0n,
        payer.address,
        merchantId
      );

      await expect(
        gateway
          .connect(merchantRecipient)
          .refund(
            paymentId,
            await token.getAddress(),
            0,
            payer.address,
            merchantId,
            refundSignature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: amount must be > 0');
    });

    it('Should reject refund with zero token address', async function () {
      const { gateway, payer, signer, merchantRecipient, merchantId, paymentId, amount } =
        await makeFinalizedPaymentFixture();

      const refundSignature = await createRefundSignature(
        signer,
        gateway,
        paymentId,
        ethers.ZeroAddress,
        amount,
        payer.address,
        merchantId
      );

      await expect(
        gateway
          .connect(merchantRecipient)
          .refund(
            paymentId,
            ethers.ZeroAddress,
            amount,
            payer.address,
            merchantId,
            refundSignature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: invalid token');
    });

    it('Should reject refund with zero payer address', async function () {
      const { gateway, token, signer, merchantRecipient, merchantId, paymentId, amount } =
        await makeFinalizedPaymentFixture();

      await token.connect(merchantRecipient).approve(await gateway.getAddress(), amount);

      const refundSignature = await createRefundSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        ethers.ZeroAddress,
        merchantId
      );

      await expect(
        gateway
          .connect(merchantRecipient)
          .refund(
            paymentId,
            await token.getAddress(),
            amount,
            ethers.ZeroAddress,
            merchantId,
            refundSignature,
            ZERO_PERMIT
          )
      ).to.be.revertedWith('PG: invalid payer');
    });

    it('Should work with meta-transaction for refund', async function () {
      const {
        gateway,
        forwarder,
        token,
        payer,
        signer,
        merchantRecipient,
        merchantId,
        paymentId,
        amount,
      } = await makeFinalizedPaymentFixture();

      // Merchant approves gateway
      await token.connect(merchantRecipient).approve(await gateway.getAddress(), amount);

      const refundSignature = await createRefundSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        payer.address,
        merchantId
      );

      // Encode the refund function call
      const data = gateway.interface.encodeFunctionData('refund', [
        paymentId,
        await token.getAddress(),
        amount,
        payer.address,
        merchantId,
        refundSignature,
        ZERO_PERMIT,
      ]);

      // Get nonce for merchant
      const nonce = await forwarder.nonces(merchantRecipient.address);
      const forwarderDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      // Sign the forward request
      const domain = {
        name: 'SoloForwarder',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await forwarder.getAddress(),
      };

      const types = {
        ForwardRequest: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'gas', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint48' },
          { name: 'data', type: 'bytes' },
        ],
      };

      const message = {
        from: merchantRecipient.address,
        to: await gateway.getAddress(),
        value: 0n,
        gas: 500000n,
        nonce: nonce,
        deadline: forwarderDeadline,
        data: data,
      };

      const forwarderSignature = await merchantRecipient.signTypedData(domain, types, message);

      const requestData = {
        from: merchantRecipient.address,
        to: await gateway.getAddress(),
        value: 0n,
        gas: 500000n,
        deadline: forwarderDeadline,
        data: data,
        signature: forwarderSignature,
      };

      const payerBalanceBefore = await token.balanceOf(payer.address);

      // Execute via forwarder
      await expect(forwarder.execute(requestData)).to.emit(gateway, 'RefundCompleted');

      // Verify refund
      expect(await gateway.isPaymentRefunded(paymentId)).to.equal(true);
      const payerBalanceAfter = await token.balanceOf(payer.address);
      expect(payerBalanceAfter - payerBalanceBefore).to.equal(amount);
    });
  });

  // ============ ERC20 Permit Support ============

  describe('ERC20 Permit Support', function () {
    it('Should accept payment with valid permit signature', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('PERMIT_ORDER_001');
      const amount = ethers.parseEther('50');
      const feeBps = 0;

      const serverSignature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      // Create permit signature (no approve needed!)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const permit = await createPermitSignature(
        token,
        payer,
        await gateway.getAddress(),
        amount,
        deadline
      );

      // Make payment with permit (NO prior approve needed)
      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            await token.getAddress(),
            amount,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            ESCROW_DURATION,
            serverSignature,
            permit
          )
      )
        .to.emit(gateway, 'PaymentEscrowed')
        .withArgs(
          paymentId,
          merchantId,
          payer.address,
          merchantRecipient.address,
          await token.getAddress(),
          amount,
          (escrowDeadline: bigint) => escrowDeadline > 0n,
          (timestamp: bigint) => timestamp > 0n
        );

      expect(await gateway.isPaymentProcessed(paymentId)).to.equal(true);
      // Tokens held in contract (escrow)
      expect(await token.balanceOf(await gateway.getAddress())).to.equal(amount);
    });

    it('Should silently ignore expired permit and fail on insufficient allowance', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('PERMIT_ORDER_002');
      const amount = ethers.parseEther('50');
      const feeBps = 0;

      const serverSignature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      // Create permit with past deadline
      const expiredDeadline = BigInt(Math.floor(Date.now() / 1000) - 3600); // 1 hour ago
      const permit = await createPermitSignature(
        token,
        payer,
        await gateway.getAddress(),
        amount,
        expiredDeadline
      );

      // With try/catch permit pattern, expired permit is silently ignored.
      // Without prior approve, transferFrom fails with ERC20InsufficientAllowance.
      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            await token.getAddress(),
            amount,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            ESCROW_DURATION,
            serverSignature,
            permit
          )
      ).to.be.revertedWithCustomError(token, 'ERC20InsufficientAllowance');
    });

    it('Should allow traditional approve flow when permit deadline is 0', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      const paymentId = ethers.id('TRADITIONAL_ORDER_001');
      const amount = ethers.parseEther('50');
      const feeBps = 0;

      const serverSignature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      // Traditional approve
      await token.connect(payer).approve(await gateway.getAddress(), amount);

      // Make payment with ZERO_PERMIT (traditional flow)
      await expect(
        gateway
          .connect(payer)
          .pay(
            paymentId,
            await token.getAddress(),
            amount,
            merchantRecipient.address,
            merchantId,
            feeBps,
            paymentDeadline,
            ESCROW_DURATION,
            serverSignature,
            ZERO_PERMIT
          )
      ).to.emit(gateway, 'PaymentEscrowed');

      expect(await gateway.isPaymentProcessed(paymentId)).to.equal(true);
    });

    it('Should work with permit for refund', async function () {
      const { gateway, token, payer, signer, merchantRecipient, merchantId } =
        await loadFixture(deployFixture);

      // First make an escrow payment and finalize it
      const paymentId = ethers.id('REFUND_PERMIT_001');
      const amount = ethers.parseEther('100');
      const feeBps = 0;

      const paymentSignature = await createServerSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        merchantRecipient.address,
        merchantId,
        feeBps,
        paymentDeadline,
        ESCROW_DURATION
      );

      await token.connect(payer).approve(await gateway.getAddress(), amount);
      await gateway
        .connect(payer)
        .pay(
          paymentId,
          await token.getAddress(),
          amount,
          merchantRecipient.address,
          merchantId,
          feeBps,
          paymentDeadline,
          ESCROW_DURATION,
          paymentSignature,
          ZERO_PERMIT
        );

      // Finalize the payment (merchant receives tokens)
      const finalizeSignature = await createFinalizeSignature(signer, gateway, paymentId);
      await gateway.finalize(paymentId, finalizeSignature);

      // Create refund signature
      const refundSignature = await createRefundSignature(
        signer,
        gateway,
        paymentId,
        await token.getAddress(),
        amount,
        payer.address,
        merchantId
      );

      // Create permit for refund (merchant approving gateway)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const permit = await createPermitSignature(
        token,
        merchantRecipient,
        await gateway.getAddress(),
        amount,
        deadline
      );

      // Process refund with permit (NO prior approve needed)
      await expect(
        gateway
          .connect(merchantRecipient)
          .refund(
            paymentId,
            await token.getAddress(),
            amount,
            payer.address,
            merchantId,
            refundSignature,
            permit
          )
      ).to.emit(gateway, 'RefundCompleted');

      expect(await gateway.isPaymentRefunded(paymentId)).to.equal(true);
    });
  });
});

// Mock ERC20 contract for testing
describe('MockERC20', function () {
  // This is just to ensure the mock is available
});
