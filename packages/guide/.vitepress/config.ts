import { defineConfig } from 'vitepress';

const koDeveloperSidebar = [
  {
    text: '시작하기 및 연동',
    items: [
      { text: '빠른 시작', link: '/ko/developer/quick-start' },
      { text: '서비스 개요', link: '/ko/developer/introduction' },
      { text: '결제 동작 원리', link: '/ko/developer/how-it-works' },
      { text: '클라이언트 사이드 연동', link: '/ko/developer/client-side' },
      { text: 'API 인증', link: '/ko/developer/authentication' },
      { text: '테스트 및 검증', link: '/ko/developer/testing' },
      { text: 'FAQ 및 트러블슈팅', link: '/ko/developer/troubleshooting' },
    ],
  },
  {
    text: '상세 기능',
    items: [
      { text: '결제 생성', link: '/ko/payments/create' },
      { text: '상태 조회', link: '/ko/payments/status' },
      { text: '결제 내역', link: '/ko/payments/history' },
      { text: '결제 확정 및 취소', link: '/ko/payments/finalize' },
      { text: '환불 (Refunds)', link: '/ko/payments/refunds' },
      { text: 'Webhook 설정', link: '/ko/webhooks/' },
      { text: '서명 검증', link: '/ko/webhooks/verify' },
      { text: '이벤트 상세', link: '/ko/webhooks/events' },
    ],
  },
  {
    text: '개발 라이브러리',
    items: [
      { text: '위젯 연동', link: '/ko/widget/' },
      { text: '스마트 컨트랙트', link: '/ko/developer/smart-contracts' },
    ],
  },
  {
    text: 'API Reference',
    items: [
      { text: 'API 전체 명세', link: '/ko/api/' },
      { text: '에러 코드', link: '/ko/api/errors' },
    ],
  },
];

const enDeveloperSidebar = [
  {
    text: 'Getting Started',
    items: [
      { text: 'Quick Start', link: '/en/developer/quick-start' },
      { text: 'Service Overview', link: '/en/developer/introduction' },
      { text: 'How Payments Work', link: '/en/developer/how-it-works' },
      { text: 'Client-Side Integration', link: '/en/developer/client-side' },
      { text: 'API Authentication', link: '/en/developer/authentication' },
      { text: 'Testing & QA', link: '/en/developer/testing' },
      { text: 'FAQ & Troubleshooting', link: '/en/developer/troubleshooting' },
    ],
  },
  {
    text: 'Detailed Features',
    items: [
      { text: 'Create Payment', link: '/en/payments/create' },
      { text: 'Payment Status', link: '/en/payments/status' },
      { text: 'Payment History', link: '/en/payments/history' },
      { text: 'Finalize & Cancel', link: '/en/payments/finalize' },
      { text: 'Refunds', link: '/en/payments/refunds' },
      { text: 'Webhook Setup', link: '/en/webhooks/' },
      { text: 'Signature Verification', link: '/en/webhooks/verify' },
      { text: 'Event Details', link: '/en/webhooks/events' },
    ],
  },
  {
    text: 'Libraries',
    items: [
      { text: 'Widget Integration', link: '/en/widget/' },
      { text: 'Smart Contracts', link: '/en/developer/smart-contracts' },
    ],
  },
  {
    text: 'API Reference',
    items: [
      { text: 'Full API Spec', link: '/en/api/' },
      { text: 'Error Codes', link: '/en/api/errors' },
    ],
  },
];

export default defineConfig({
  title: 'SoloPay',
  description: 'SoloPay Documentation - Blockchain Payment Gateway',

  head: [['link', { rel: 'icon', href: '/solo-pay.svg', type: 'image/svg+xml' }]],

  locales: {
    ko: {
      label: '한국어',
      lang: 'ko',
      link: '/ko/',
      themeConfig: {
        nav: [
          { text: '개발자 가이드', link: '/ko/developer/' },
          { text: '유저 가이드', link: '/ko/user/' },
        ],
        sidebar: {
          '/ko/developer/': koDeveloperSidebar,
          '/ko/payments/': koDeveloperSidebar,
          '/ko/gasless/': koDeveloperSidebar,
          '/ko/webhooks/': koDeveloperSidebar,
          '/ko/widget/': koDeveloperSidebar,
          '/ko/sdk/': koDeveloperSidebar,
          '/ko/api/': koDeveloperSidebar,
          '/ko/user/': [
            {
              text: '유저 가이드',
              items: [{ text: '결제 방법', link: '/ko/user/' }],
            },
          ],
        },
        outline: {
          level: [2, 3],
          label: '이 페이지',
        },
      },
    },
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/',
      themeConfig: {
        nav: [
          { text: 'Developer Guide', link: '/en/developer/' },
          { text: 'User Guide', link: '/en/user/' },
        ],
        sidebar: {
          '/en/developer/': enDeveloperSidebar,
          '/en/payments/': enDeveloperSidebar,
          '/en/gasless/': enDeveloperSidebar,
          '/en/webhooks/': enDeveloperSidebar,
          '/en/widget/': enDeveloperSidebar,
          '/en/sdk/': enDeveloperSidebar,
          '/en/api/': enDeveloperSidebar,
          '/en/user/': [
            {
              text: 'User Guide',
              items: [{ text: 'How to Pay', link: '/en/user/' }],
            },
          ],
        },
        outline: {
          level: [2, 3],
          label: 'On this page',
        },
      },
    },
  },

  themeConfig: {
    logo: { src: '/solo-pay.svg', alt: 'SoloPay' },
    socialLinks: [{ icon: 'github', link: 'https://github.com/supertrust/solo-pay' }],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'SoloPay Documentation',
      copyright: 'Copyright © 2026 SoloPay',
    },

    darkModeSwitchLabel: '',
    darkModeSwitchTitle: '',
  },
});
