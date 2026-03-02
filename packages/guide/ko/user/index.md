# 유저 가이드

SoloPay로 결제하는 방법을 안내합니다.

## 시작하기 전에

SoloPay로 결제하려면 다음이 필요합니다.

- **MetaMask** 또는 **Trust Wallet** (브라우저 확장 또는 모바일 앱)
- 결제에 사용할 **ERC-20 토큰** 잔액

::: tip 가스비 없음
SoloPay는 블록체인 가스비를 대신 납부합니다. POL 등 네이티브 토큰이 없어도 결제할 수 있습니다.
:::

## Step 1: 지갑 선택

결제 위젯이 열리면 사용할 지갑을 선택합니다.

![지갑 선택](/images/user-guide/01-wallet-connect.png)

## MetaMask로 결제하기

### Step 2: 연결 승인

MetaMask 팝업이 열립니다. 계정을 선택한 뒤 **Connect**를 클릭합니다.

![MetaMask 연결 승인](/images/user-guide/02-metamask-connect.png)

### Step 3: 결제 내용 확인

결제 금액, 네트워크, 가스비를 확인합니다. 가스비는 SoloPay가 부담하므로 **Free (Covered by Solo Pay)** 로 표시됩니다. **Pay Now**를 클릭합니다.

![결제 내용 확인](/images/user-guide/03-payment-confirm.png)

### Step 4: 토큰 사용 승인 서명

**Spending cap request** 팝업이 표시됩니다. SoloPay가 토큰을 처리하기 위한 서명으로, 트랜잭션이 아니므로 **가스비가 발생하지 않습니다**. **Confirm**을 클릭합니다.

![토큰 사용 승인 서명](/images/user-guide/04-metamask-approve.png)

### Step 5: 결제 서명

**Signature request** 팝업이 표시됩니다. 최종 결제 승인 서명입니다. 가스비가 발생하지 않습니다. **Confirm**을 클릭합니다.

![결제 서명](/images/user-guide/05-sign-request.png)

### Step 6: 결제 완료

**Payment Complete** 화면이 표시되면 결제가 완료되었고, 결제 금액은 안전하게 보관됩니다. **Confirm**을 클릭하면 가맹점 페이지로 돌아갑니다. 이후 가맹점이 주문을 확정(결제 완료)하거나 취소(환불)하며, 사용자는 별도로 할 일이 없습니다.

![결제 완료](/images/user-guide/06-payment-complete.png)

## Trust Wallet으로 결제하기

### Step 2: 연결 승인

Trust Wallet 팝업이 열립니다. 계정을 확인한 뒤 **Connect**를 클릭합니다.

![Trust Wallet 연결 승인](/images/user-guide/02-trustwallet-connect.png)

### Step 3: 결제 내용 확인

결제 금액, 네트워크, 가스비를 확인합니다. 가스비는 SoloPay가 부담하므로 **Free (Covered by Solo Pay)** 로 표시됩니다. **Pay Now**를 클릭합니다.

![결제 내용 확인](/images/user-guide/03-payment-confirm.png)

### Step 4: 토큰 사용 승인 서명

상단에 **High risk message payload** 경고가 표시됩니다. Trust Wallet의 기본 보안 안내이며 정상적인 결제 절차입니다. **Confirm**을 클릭합니다.

![서명 요청 화면](/images/user-guide/04-trustwallet-approve.png)

### Step 5: 결제 서명

**Signature request** 팝업이 표시됩니다. 최종 결제 승인 서명입니다. 가스비가 발생하지 않습니다. **Confirm**을 클릭합니다.

![결제 서명](/images/user-guide/05-trustwallet-sign-request.png)

### Step 6: 결제 완료

**Payment Complete** 화면이 표시되면 결제가 완료되었고, 결제 금액은 안전하게 보관됩니다. **Confirm**을 클릭하면 가맹점 페이지로 돌아갑니다. 이후 가맹점이 주문을 확정(결제 완료)하거나 취소(환불)하며, 사용자는 별도로 할 일이 없습니다.

![결제 완료](/images/user-guide/06-payment-complete.png)

## 자주 묻는 질문

1. **가스비가 왜 없나요?**

   SoloPay는 가스리스(Gasless) 결제 방식을 사용합니다. 블록체인 수수료를 SoloPay가 대신 납부하므로 사용자는 추가 비용 없이 결제할 수 있습니다.

2. **서명 요청이 2번 나오는 이유는 무엇인가요?**

   처음 결제 시 토큰 사용 승인(Step 4)과 결제 서명(Step 5)이 순서대로 요청됩니다. 두 번 모두 트랜잭션이 아닌 서명이므로 가스비가 발생하지 않습니다.

3. **Trust Wallet에서 "Warning! You could lose all your tokens!" 경고가 표시됩니다.**

   Trust Wallet이 Permit 방식의 서명 요청에 표시하는 기본 보안 경고입니다. SoloPay는 검증된 서비스이므로 안심하고 **Continue anyway**를 클릭해 진행하세요.

4. **가맹점에서 결제가 아직 처리 중이라고 표시됩니다. 왜 그런가요?**

   **Payment Complete** 화면이 보이면 결제는 이미 확정된 것이며, 금액은 안전하게 보관됩니다. 가맹점이 주문을 확인한 뒤 결제를 최종 완료하거나, 필요 시 취소 후 환불합니다. 보통 잠시면 완료되며, 사용자가 따로 할 일은 없습니다.
