# 보호자노트

가족이 일정, 돌봄 기록, 교대 브리핑, 회진 질문, 비용과 퇴원 준비를 함께 관리하는 무료 모바일 우선 PWA입니다. 안내문 사진은 서버에 올리지 않고 사용자의 브라우저에서 한글만 추출하며, 확인한 텍스트만 저장합니다. 의료적 판단이나 처방은 제공하지 않습니다.

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

계정·해시 세션·개별 동의·돌봄방 권한·초대·확인한 OCR 텍스트·CMS·알림·감사 기록은 모두 Prisma 정규화 테이블에 저장됩니다. 로컬은 SQLite, Docker는 PostgreSQL을 사용하며 서버 재시작 뒤에도 복구됩니다. 이전 개발 데이터의 `RuntimeState`는 첫 실행 때 한 번 읽어 정규화 테이블로 이전하는 호환 코드만 남아 있고 새 데이터는 더 이상 여기에 쓰지 않습니다.

새 사진 글자 추출 흐름에서는 원본 사진을 업로드하거나 저장하지 않습니다. 이전 개발 버전에서 저장한 원본과의 호환을 위해 비공개 업로드 저장소 코드는 유지됩니다.

## 외부 서비스 전환

- OCR: Tesseract.js 실행 파일과 한국어 학습 데이터를 자체 호스팅합니다. 사진 처리는 브라우저 안에서만 이뤄지고 확인한 텍스트만 서버에 저장됩니다.
- AI: `AI_DOCUMENT_ANALYSIS_ENABLED=false`가 기본이며 서버 AI 분석은 다음 단계까지 차단됩니다.
- 결제: `FREE_SERVICE=true`가 기본이며 결제 요청은 차단됩니다. 현재 모든 핵심 기능은 무료입니다.
- 광고: 승인된 보호자노트 도메인과 광고 단위가 생긴 뒤 `NEXT_PUBLIC_ADSENSE_CLIENT`, `NEXT_PUBLIC_ADSENSE_SLOT`을 설정하면 공개 랜딩 화면에만 표시됩니다. 민감한 돌봄방 화면에는 광고를 넣지 않습니다. 자세한 절차는 `docs/ADSENSE_DEPLOYMENT.md`를 참고하세요.
- 이메일: `EMAIL_PROVIDER=fixture`에서는 화면에 인증번호가 표시됩니다. 인터넷 공개 전에는 실제 메일 발송 공급자를 연결하고 테스트 번호 노출을 끄세요.
- 알림/스토리지: 인앱 알림과 로컬 비공개 저장은 실제 동작합니다. 푸시·문자·외부 객체 저장소가 필요하면 국내 정책에 맞는 공급자를 연결하고 최소권한 및 감사 로그를 유지하세요.

출시 전 운영자 정보, 보존기간, 개인정보 처리방침·약관, 광고 쿠키 고지는 법률 전문가 검토가 필요합니다. 세부 운영 기준은 `docs/` 문서를 참고하세요.

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
