# 보호자노트

입원 안내문 원본을 안전하게 저장하고 로컬 분석기로 구조화한 뒤, 가족이 일정, 돌봄 기록, 교대 브리핑, 회진 질문, 비용과 퇴원 준비를 함께 관리하는 모바일 우선 PWA입니다. AI 결과는 사용자가 원문과 대조해 확정해야 하며 의료적 판단이나 처방을 제공하지 않습니다.

## 바로 실행

요구 사항: Node.js 20 이상, Chrome.

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다. 개발용 계정은 `demo@guardian.local / demo1234`, 관리자 계정은 `admin@guardian.local / admin1234`입니다. 운영에서는 반드시 제거하거나 별도 인증 공급자로 교체해야 합니다.

## 검증

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Playwright는 설치된 Chrome을 사용하며 360px 모바일 화면과 명세의 17개 필수 흐름을 검증합니다.

## 데이터베이스

`prisma/schema.prisma`는 전체 운영 데이터 모델과 케이스 단위 권한 경계를 정의합니다. 로컬 스키마 확인은 다음과 같습니다.

```powershell
npx prisma validate
npx prisma generate
npx prisma db push
npm run db:seed
```

계정·해시 세션·개별 동의·돌봄방 권한·초대·문서·AI 추출 필드·결제·CMS·알림·감사 기록은 모두 Prisma 정규화 테이블에 저장됩니다. 로컬은 SQLite, Docker는 PostgreSQL을 사용하며 서버 재시작 뒤에도 복구됩니다. 이전 개발 데이터의 `RuntimeState`는 첫 실행 때 한 번 읽어 정규화 테이블로 이전하는 호환 코드만 남아 있고 새 데이터는 더 이상 여기에 쓰지 않습니다.

업로드 원본은 `UPLOAD_DIR` 아래에 무작위 저장명으로 보관되고 권한 검사를 통과한 사용자에게만 내려갑니다. Docker에서는 `guardian-uploads` 볼륨에 유지됩니다. 운영 규모가 커지면 국내 정책에 맞는 비공개 객체 저장소와 악성코드 검사기로 교체하세요.

## 외부 서비스 전환

- AI: 기본 `AI_PROVIDER=local`은 텍스트가 포함된 PDF의 날짜·장소·금식·준비물을 로컬에서 추출합니다. 스캔 이미지 OCR이나 외부 AI는 수탁·국외이전 고지와 별도 동의가 확정된 뒤 공급자 어댑터를 추가하세요. 알 수 없는 공급자 값은 안전하게 차단됩니다.
- 결제: `PAYMENT_PROVIDER=test`는 멱등 결제·실패·환불 흐름을 검증하는 테스트 어댑터이며 실제 카드 승인은 하지 않습니다. 다른 값을 넣으면 PG 구현과 사업자 고지가 끝날 때까지 결제가 차단됩니다.
- 이메일: `EMAIL_PROVIDER=fixture`에서는 화면에 인증번호가 표시됩니다. 인터넷 공개 전에는 실제 메일 발송 공급자를 연결하고 테스트 번호 노출을 끄세요.
- 알림/스토리지: 인앱 알림과 로컬 비공개 저장은 실제 동작합니다. 푸시·문자·외부 객체 저장소가 필요하면 국내 정책에 맞는 공급자를 연결하고 최소권한 및 감사 로그를 유지하세요.

출시 전 사업자 정보, PG, 보존기간, 개인정보 처리방침·약관, 수탁사·국외 이전 정보는 법률 전문가 검토가 필요합니다. 세부 운영 기준은 `docs/` 문서를 참고하세요.

## GitHub에서 Docker로 실행

저장소를 내려받은 뒤 배포용 환경 파일을 만듭니다.

```powershell
Copy-Item .env.docker.example .env.docker
```

`.env.docker`에서 데이터베이스·세션·관리자 비밀번호를 임의의 긴 값으로 바꾼 다음 실행합니다.

```powershell
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker ps
```

브라우저에서 `http://localhost:3000`을 열면 됩니다. PostgreSQL 데이터는 `guardian-postgres`, 업로드 원본은 `guardian-uploads` 볼륨에 유지됩니다.

중지와 재실행:

```powershell
docker compose --env-file .env.docker stop
docker compose --env-file .env.docker start
```

백업:

```powershell
docker compose --env-file .env.docker exec -T postgres pg_dump -U guardian_note guardian_note > guardian-note-backup.sql
```

`.env`, `.env.docker`, DB 파일과 출력 폴더는 Git에서 제외됩니다. 인터넷에 공개할 때는 HTTPS 도메인을 연결하고 `APP_URL`을 실제 주소로 변경해야 합니다.
