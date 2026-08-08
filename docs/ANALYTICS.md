# 분석 이벤트 사전

모든 이벤트의 공통 허용 속성은 `event_version`, `occurred_at`, `anonymous_or_pseudonymous_id`, `session_id`, `platform`, `plan_code`, `experiment_variant`, `success`, `error_category`다. 자유 텍스트는 금지한다.

| 이벤트 | 핵심 허용 속성 |
|---|---|
| landing_cta_clicked | cta_id, placement |
| signup_completed | auth_method |
| identity_verified | method |
| legal_agreement_completed | document_type, version |
| case_created | relationship_category |
| consent_completed | consent_type, version |
| document_uploaded | mime_category, size_bucket, page_bucket |
| extraction_completed | provider_code, schema_version, latency_bucket, success |
| extraction_confirmed | edited_field_count_bucket |
| family_invited / invitation_accepted | role, channel |
| task_assigned | priority, due_bucket |
| handoff_created / handoff_acknowledged | item_count_bucket |
| discharge_plan_started | days_to_discharge_bucket |
| paywall_viewed / checkout_started | plan_code, price_variant |
| purchase_completed | plan_code, amount_krw, test_mode |
| partner_lead_submitted | partner_category, consent_version |
| data_exported | export_type |
| account_deletion_requested | reason_category |

절대 금지: 환자/사용자 이름, 전화·이메일, 질환, 병원/병동, 문서/이미지/메모 원문, 질문·답변, 정밀 시각표, 파일명, 초대 토큰, IP 전체값. 이벤트 스키마는 서버 허용목록으로 검사하고 새 이벤트는 개인정보 검토 후 `AnalyticsEventDefinition`에 버전 등록한다.

퍼널은 방문→가입→본인확인→케이스→가족연결→활성→결제로 본다. 30일 활성, 첫 케이스, 가족 연결, 유료/탈퇴 지표를 서로 구분하고 마케팅 미동의를 제품 분석 동의로 간주하지 않는다. 공급자 비활성화 시 핵심 기능은 계속 동작한다.

