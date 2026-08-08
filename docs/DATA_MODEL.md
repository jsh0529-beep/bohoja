# 데이터 모델

## 영역

- 계정/법무: `User`, `UserProfile`, `UserIdentity`, `UserStatusHistory`, `LegalDocument`, `LegalDocumentVersion`, `UserAgreement`, `MarketingConsent`.
- 케이스/권한: `PatientCase`, `CaseConsent`, `CaseMember`, `Invitation`.
- 문서/AI: `SourceDocument`, `DocumentPage`, `ExtractionJob`, `ExtractedField`.
- 돌봄: `Event`, `Task`, `CareLog`, `HandoffReport`, `HandoffAcknowledgement`, `RoundingQuestion`, `Expense`, `ExpenseSplit`, `DischargePlan`, `DischargeItem`, `Attachment`.
- 운영/상품: `Plan`, `Subscription`, `PaymentEvent`, `Coupon`, `PartnerService`, `PartnerLead`, `Notification`, `NotificationPreference`.
- 거버넌스: `AuditLog`, `PrivacyRequest`, `PrivacyRequestAction`, `ServiceNotice`, `NoticeAcknowledgement`, `ProcessorAndSubprocessor`, `PolicyChangeNotification`, `FeatureFlag`, `AnalyticsEventDefinition`.

## 관계 원칙

케이스 종속 데이터는 모두 `caseId`를 직접 가져 권한 필터가 일관된다. 소유자는 활성 `CaseMember` 한 명 이상이어야 하며 소유권 이전 없이 마지막 소유자를 제거할 수 없다. 초대는 토큰 원문 대신 SHA-256 해시만 저장하고 만료·회수·단일 사용을 원자적으로 검사한다.

AI 필드는 원문 페이지와 근거 좌표/인용을 연결한다. `ExtractionJob.confirmedAt/confirmedById`가 없으면 생성 자원 연결을 금지한다. 비용 합계와 분담 합계는 서버 트랜잭션에서 검증한다.

## 삭제

- 사용자 삭제: 즉시 세션/초대/공유를 차단하고 사용자 화면에서 숨긴 뒤 삭제 큐로 보낸다.
- 케이스 삭제: 유예기간 중 복구 가능한 논리 삭제, 만료 후 첨부 원본→파생물→도메인 행 순서로 삭제한다.
- 거래 증적: 법정 보존이 필요한 최소 결제·계약 기록을 프로필/건강정보와 분리하고 접근을 제한한다.
- 감사 증적: 원문 민감정보를 담지 않고 법적·보안 목적 기간만 보존한다.

세부 기간은 [RETENTION_DELETION_SCHEDULE.md](./RETENTION_DELETION_SCHEDULE.md)를 따른다. DB cascade는 편의를 위한 삭제 정책으로 간주하지 않으며 삭제 작업이 보존 예외를 먼저 분리한다.

## 인덱스와 제약

`(caseId, createdAt)`, `(caseId, status/dueAt)`, 활성 멤버 `(caseId,userId)`, 문서 작업 `(sourceDocumentId,status)`, 결제 `(provider,providerEventId)`, 공지 `(status,publishedAt)`를 인덱싱한다. 이메일/전화는 정규화 후 unique 처리하되 가능한 경우 암호화/블라인드 인덱스를 적용한다.

