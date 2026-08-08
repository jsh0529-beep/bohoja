# 아키텍처

## 구성

```mermaid
flowchart LR
  U["모바일/데스크톱 PWA"] --> N["Next.js App Router"]
  N --> A["서버 액션/API + Zod"]
  A --> P[("PostgreSQL / Prisma")]
  A --> S["비공개 객체 저장소"]
  A --> I["AI/OCR 어댑터"]
  A --> G["인증 어댑터"]
  A --> Y["결제 어댑터"]
  A --> M["알림/분석/제휴 어댑터"]
  A --> Q["작업 큐"]
```

## 경계와 불변조건

- 브라우저는 DB, AI 키, 저장소 키에 직접 접근하지 않는다.
- 모든 케이스 자원 요청은 서버에서 `case_members`의 활성 역할을 확인한다. UI 숨김은 보안 경계가 아니다.
- DB 접근 정책(RLS 사용 시)과 서버 검사를 함께 적용하고 `case_id` 누락을 테스트한다.
- 업로드는 MIME/확장자/크기/페이지를 검사하고 비공개 저장 후 짧은 서명 URL만 제공한다.
- AI 결과는 검증된 JSON으로 저장하되 `CONFIRMED` 전에는 일정·업무를 만들 수 없다.
- 결제 웹훅은 서명·멱등키를 검증한다. 카드정보를 저장하지 않는다.
- 정책/동의는 변경 가능한 문서 ID가 아니라 불변 버전 ID와 제시 원문 해시를 증적으로 남긴다.
- 시간은 UTC, 표시는 Asia/Seoul; 금액은 원 단위 정수다.

## 어댑터

`AuthProvider`, `AiExtractionProvider`, `ObjectStorageProvider`, `PaymentProvider`, `NotificationProvider`, `AnalyticsProvider`, `PartnerLeadProvider`를 서버 인터페이스로 분리한다. 테스트 구현은 결정적 fixture, 고정 시계와 멱등 응답을 제공한다. 운영 구현은 환경변수 검증이 실패하면 시작 또는 해당 기능을 안전하게 차단한다.

## 비동기 흐름

문서 업로드는 `QUEUED → PROCESSING → NEEDS_REVIEW|FAILED`; 삭제는 `REQUESTED → QUARANTINED → PURGED`; 알림은 동의·환경·중복 여부를 재검사한 후 발송한다. 작업 재시도는 지수 백오프와 최대 횟수를 사용하며 민감 원문을 오류 로그에 남기지 않는다.

## 관찰성과 복구

구조화 로그에는 요청/지원 코드, 가명 사용자 ID, 작업 ID, 결과 코드만 기록한다. 감사로그는 행위자·대상·전후 요약·시각을 append-only로 보존한다. DB 일일 백업, 객체 저장소 수명주기, 복구훈련과 RPO/RTO는 출시 전에 운영자가 확정한다.

