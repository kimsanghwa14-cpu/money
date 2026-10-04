# 설치와 가족 DB 연결

현재 저장소는 Next.js App Router + TypeScript + Tailwind CSS + Supabase Auth/PostgreSQL 구성이다. Cloudflare Pages 빌드는 기존 React 화면과 Pages Functions를 사용한다. 배포 설정은 `docs/CLOUDFLARE.md`를 참고한다. 기존 엑셀·이미지·실제 거래 데이터는 제공되지 않았다. 운영 데이터나 인증정보를 생성·추정하지 않았다.

## 1. 로컬 실행

Node.js 22.18 이상(이 작업 환경에서는 24.21)을 사용한다. Next.js 자체의 최소 버전과 별도로, 외부 테스트 라이브러리 없이 TypeScript 테스트를 실행하기 위해 이 기준을 사용한다.

```bash
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:3000`을 연다. Codespaces에서는 Ports 탭에서 3000번 포트를 열고, 해당 포트의 전달 주소를 `NEXT_PUBLIC_SITE_URL` 및 Supabase 인증 리디렉션 허용 목록에 추가한다. 개발 서버를 다시 시작한다. 환경변수가 없으면 실제 가계부 대신 **DB 미연결** 안내를 표시한다. `index.html`을 직접 열어서 사용하는 앱이 아니다.

최초 설치 후 생성되는 `package-lock.json`은 보관하고 이후에는 `npm ci`를 사용한다. 이번 환경은 npm 레지스트리 DNS가 차단되어 설치에 실패했으므로, 아직 검증된 lockfile이 없다.

## 2. Supabase 프로젝트와 마이그레이션

**새 개발용 Supabase 프로젝트**를 만든다. 이미 쓰는 운영 DB는 초기화하지 않는다. SQL Editor에서 아래 파일 전체를 번호 순서대로 실행한다. 각각 트랜잭션이며 테이블을 삭제하지 않는다. 동일 파일을 두 번 실행하지 않는다.

1. `supabase/migrations/20261004012408_family_ledger_initial.sql`
2. `supabase/migrations/20261004012420_family_ledger_snapshot.sql`

또는 Supabase CLI를 쓰는 경우 검토한 새 프로젝트에만 연결한 뒤 `supabase db push`로 적용한다. **기존 money 프로젝트(`uqwoshogxwayntrpajdi`)에는 2026-10-04 두 마이그레이션을 이미 적용했다. 해당 프로젝트에서 SQL을 다시 실행하지 않는다.** 파일명은 실제 원격 마이그레이션 이력과 일치한다.

DB에는 가족/구성원, 귀속, 분류, 결제수단, 계좌·카드, 단일 거래원장, 반복규칙 버전/발생 회차, 월별 예산, 자산, 비정기 계획, 가져오기 이력, 저장 요청, 감사 이력 구조가 있다. 자산·비정기 연결·가져오기 UI는 2차 범위로 아직 제공하지 않는다.

## 3. 인증과 가족 승인

Supabase Authentication에서 이메일 로그인을 켜고 **공개 회원가입을 비활성화**한다. URL Configuration의 Site URL과 Redirect URLs에 개발 주소 및 `http://localhost:3000/auth/callback`을 등록한다. Codespaces/Vercel에서는 해당 실제 주소와 `/auth/callback` 경로도 등록한다.

Authentication → Users에서 가족 계정 두 개를 만든다. 비밀번호 로그인은 비밀번호가 설정된 계정을 사용한다. 기존 계정은 이메일 로그인 링크도 사용할 수 있다. 운영 이메일 발송에는 Supabase SMTP 설정과 발송 제한도 확인한다. 이번 작업은 계정을 만들거나 이메일을 발송하지 않았다.

두 계정의 **User UID**를 확인하고 SQL Editor에서 아래 예시를 실제 UID로 바꾸어 실행한다. 이메일이나 비밀번호는 SQL에 적지 않는다. UUID 예시 문자열을 그대로 실행하면 안 된다.

```sql
begin;
with family as (
  insert into public.families(name) values ('우리 가족') returning id
)
insert into public.family_members(family_id,user_id,display_name,role)
select id, '상화_계정의_USER_UID'::uuid, '상화', 'owner' from family
union all
select id, '하율_계정의_USER_UID'::uuid, '하율', 'editor' from family;
commit;
```

가족을 만들면 일반적인 분류와 결제수단만 생성한다. 금액이 있는 가상 거래·계좌는 자동 생성하지 않는다. 로그인 후 설정 메뉴에서 실제 사용할 계좌·카드를 등록한다. 계정이 Supabase에 존재해도 `family_members.active=true`로 승인되지 않으면 API·DB 접근이 차단된다. 구성원을 비활성화하려면 관리자가 `active=false`로 바꾼다. 구성원당 한 가족을 지원한다.

## 4. 환경변수

`.env.local`에 다음 값을 넣는다. 채팅·공개 저장소에 인증정보를 붙여넣지 않는다.

| 변수 | 값과 역할 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Connect/API 화면의 Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key. 기존 anon key도 지원. secret/service-role 키는 사용하지 않음 |
| `NEXT_PUBLIC_SITE_URL` | 개발·배포 앱의 정확한 origin. 기본 `http://localhost:3000` |
| `TEST_DATABASE_URL` | 선택. 운영과 분리한 테스트 프로젝트의 PostgreSQL 접속 URL |
| `E2E_EMAIL`, `E2E_PASSWORD` | 선택. 별도의 가상 테스트 가족 계정 |
| `E2E_SECOND_EMAIL`, `E2E_SECOND_PASSWORD` | 선택. 같은 테스트 가족의 두 번째 계정, 동시 수정 검증용 |
| `E2E_ALLOW_WRITES` | 기본 false. 전용 테스트 가족에서만 true |

관리자 secret/service-role 키는 앱에 필요하지 않으며 브라우저 번들에 넣지 않는다. 쓰기 요청은 로그인 쿠키, 요청 origin, 가족 소속, 서버 행 검사, DB RPC/RLS로 검증한다. 다른 호스트로 접속해 쓰기 요청이 거부되면 `NEXT_PUBLIC_SITE_URL`과 실제 접속 주소를 맞추고 서버를 재시작한다.

## 5. 사용 순서

1. 로그인하면 집계표가 열린다. 공통 월 선택은 개인 화면·고정비에도 유지된다.
2. 상화/하율/기타 원장에서 `행 추가` 또는 `10행 추가`를 누른다.
3. 날짜 셀을 클릭해 엑셀 표를 붙여넣는다. 기본 표시 열 순서: 날짜, 귀속, 거래유형, 대분류, 소분류, 내용, 금액, 결제수단, 계좌·카드, 상태. 메모·받는 계좌·환불 원거래ID는 `보조 열`을 켠다. 열이 넘치면 오류를 알리고 잘라내지 않는다.
4. 셀 오류를 고친 후 `변경사항 저장`으로 전체 변경을 원자적으로 저장한다. 서버 실패 때 입력을 보존한다. 브라우저를 닫거나 새로고침하면 미저장 입력은 사라질 수 있으므로 이동 경고를 확인하고 필요하면 오류 안내의 `입력 백업(JSON)`으로 보관한다. 백업 JSON 재가져오기 UI는 아직 없다.
5. 충돌이 생기면 `최신 내역 비교`에서 거래마다 DB 값 사용 또는 자신의 변경을 최신 버전에 적용할지 직접 선택한다. 서버에서 삭제된 거래는 백업 후 변경 취소/새로고침한다.
6. 고정비 메뉴에서 반복규칙을 등록한다. 해당 월 조회 때 **예정** 거래가 생성된다. 원장 표에서 실제 금액과 확정 상태를 저장한다. 예정금액은 별도 보존한다. 취소·삭제한 발생 회차는 재생성하지 않는다.
7. 집계표의 월별 계획예산을 저장한다. 계획은 해당 월에만 적용되고 실제 거래를 만들지 않는다. 연간 표는 저장된 월별 예산과 확정 실적을 비교한다.

반복규칙 변경은 별도 버전이며 기존 규칙의 변경 적용월은 이번 달 이후로 제한한다. 신규 규칙은 과거 시작월을 설정할 수 있다. 이미 확정·취소·직접 수정된 발생 회차는 변경하지 않는다. 변경한 월을 다시 열면 아직 손대지 않은 예정 발생 회차만 최신 적용 규칙을 반영한다. 미래 월에 이미 만든 예정 회차도 그 월을 다시 열 때 반영된다.

환불은 확정 소비지출의 거래ID와 연결해야 하며 귀속·분류가 원거래와 같아야 한다. 환불 합계는 원거래 금액을 넘을 수 없다. 원거래를 취소·삭제·귀속 변경할 때 관련 환불도 같은 배치에서 정리해야 한다. 환불은 실제 환불 날짜의 월에 원거래 분류에서 차감한다. 소비지출만 환불 연결을 지원하며 저축·원금 취소는 별도 거래유형 확장 범위다.

## 6. 검증

```bash
npm test
npm run typecheck
npm run build:next
npm run test:db
npx playwright install chromium
npm run test:e2e
```

`npm test`는 Node 내장 테스트로 외부 패키지 없이 실행한다. DB 테스트는 두 마이그레이션이 적용된 **별도 테스트 DB**, `TEST_DATABASE_URL`, `psql`이 필요하다. 모든 SQL 테스트 자료와 쓰기는 트랜잭션 종료 시 롤백한다. Docker·운영 DB 초기화는 수행하지 않는다. DB URL이나 psql이 없으면 통과로 간주하지 않고 명시적으로 skip한다.

브라우저 쓰기 테스트는 `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_ALLOW_WRITES=true`를 테스트 실행 프로세스의 환경변수로 지정해야 한다. `.env.example`만 작성했다고 테스트 runner에 자동 로드되는 것은 아니다. 앱에는 `NEXT_PUBLIC_*` 설정이 필요하다. 테스트 가족은 현재 월 거래·고정비가 없는 전용 가족이어야 한다. 테스트가 만든 가상 거래는 API로 소프트 삭제한다. 서버 URL은 로컬이며 기존 서버를 재사용한다면 앱 origin도 localhost로 맞춘다. 인증정보·실거래를 테스트 fixture에 작성하지 않는다.

작업 환경에서 **실제로 실행한 결과**와 검증하지 못한 시나리오는 `docs/STATUS.md`를 참고한다. 배포 전 typecheck/build/DB/브라우저 테스트가 필요하다.

## 7. Vercel 준비와 현재 한계

표준 Next.js 프로젝트라 Vercel의 Next.js 빌드 설정을 사용한다. 설치가 가능한 환경에서 lockfile을 만들고 검증한 뒤, 새 개발용 Vercel 프로젝트에 환경변수를 설정하고 Supabase 리디렉션 허용 목록에 배포 주소를 등록한다. 원격 Git 연결·커밋·push·Vercel 배포는 아직 하지 않았다. 기존 운영 배포를 덮어쓰지 않았다.

현재 환경 문제는 npm 레지스트리 DNS 접근 실패, Docker 소켓 권한 제한, Git 메타데이터 읽기 전용이다. `chmod`나 임의의 우회로 해결했다고 가정하지 않는다. 일반 PC 터미널 또는 해당 접근이 허용된 Codespaces에서 위 절차를 실행해야 한다.

공식 구현 참고: [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation), [Supabase SSR 인증](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
