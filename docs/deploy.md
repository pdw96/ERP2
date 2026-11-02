# 배포와 되돌리기

**살아 있는 문서**다. 데모를 Vercel(앱)과 Neon(DB)에 올리고 되돌리는 법을 든다. 고른 까닭은 ADR 0002.

이 문서의 1 · 2 는 저자가 한 번만 한다 — Claude 의 작업 환경에서는 가입과 연결을 할 수 없다. 화면의 단추 이름이
여기와 다르면 비슷한 이름을 고르고, 그 이름을 Claude 에게 알려 주면 이 문서를 고친다.

## 1. Vercel 에 레포 잇기

1. <https://vercel.com/signup> 에서 **Continue with GitHub** 로 가입한다. 요금제는 **Hobby**(무료)를 고른다.
2. 대시보드에서 **Add New…** → **Project** 를 누른다.
3. **Import Git Repository** 목록에 `ERP2` 가 없으면 **Adjust GitHub App Permissions** 에서 `pdw96/ERP2` 를 허용한다.
4. `ERP2` 옆 **Import** → 설정은 그대로 두고(Framework 는 Next.js 로 저절로 잡힌다) **Deploy** 를 누른다.
5. 1 ~ 2분 뒤 데모 주소가 나온다(프로젝트 첫 화면의 **Production Deployment** → **Domains**). 이 주소가 채용 담당자에게
   줄 데모 주소다 — **<https://erp-2-eta.vercel.app>**.
6. **Settings** → **Deployment Protection** 에서 **Vercel Authentication** 을 끈다. 켜 두면 PR 미리보기 주소를 Vercel 에
   로그인한 사람만 볼 수 있어 Claude 가 머지 전에 화면을 찍어 보일 수 없다. 미리보기도 샘플 데이터만 쓰는 공개 데모와
   같은 내용이라 감출 것이 없다(저자가 정함, 2026-11-02).

이때부터 `main` 에 머지하면 데모가 저절로 바뀌고, PR 마다 Vercel 이 미리보기 주소를 PR 댓글로 단다.

## 2. Neon DB 를 만들어 잇기

1. Vercel 의 ERP2 프로젝트에서 **Storage** 탭 → **Create Database** → **Neon** 을 고른다.
2. **Region** 은 **Washington, D.C., USA (East)** 를 고른다 — Vercel 서버의 기본 위치와 같은 곳이라 화면과 DB 사이가 짧다.
3. **Auth** 는 끈다 — 로그인은 이 단계에서 만들지 않는다(조각 「인사」가 정한다). **Realtime** 도 끈 채로 둔다.
4. **Installation Plans** 는 **Free** 를 고르고 **Continue** 를 누른다.
5. **Create** 뒤 프로젝트에 잇는 화면에서 **Custom Prefix** 는 비워 둔다 — 값을 넣으면 환경변수 이름이 `DATABASE_URL`
   에서 바뀌어 앱이 접속 정보를 찾지 못한다. 이을 환경은 **Production** 과 **Preview** 를 둘 다 켠다. 미리보기 배포마다 DB 분기를 만드는 선택지는 **반드시 켠다** —
   PR 미리보기가 데모 DB 를 건드리지 않게 하는 장치다. 선택지가 보이지 않으면 여기서 멈추고 Claude 에게 알린다.
   켜졌는지는 첫 미리보기 배포 뒤 Neon 콘솔 **Branches** 에 `preview/<가지 이름>` 분기가 생긴 것으로 본다.
6. 다 만들면 Vercel 프로젝트의 환경변수에 `DATABASE_URL` 이 저절로 들어간다(**Settings** → **Environment Variables**
   에서 이름만 확인하면 된다).
7. **Deployments** 탭 → 맨 위 배포의 **⋯** → **Redeploy** 를 눌러 환경변수를 반영한다.

## 3. 확인하기

| 무엇 | 어디서 | 맞으면 |
|---|---|---|
| 화면 | 데모 주소 | 왼쪽에 메뉴 여섯, 가운데 자재 흐름도 |
| DB | 데모 주소 뒤에 `/health` | 「연결됨」과 한국 시각. 결과는 1분마다 새로 확인한다 |
| 버전 | 같은 화면의 「배포 버전」 | 지금 떠 있는 배포의 커밋 앞 일곱 자리 — Deployments 탭의 커밋과 같다 |
| 자동 배포 | PR 을 머지하고 몇 분 뒤 데모 주소 | 머지한 변경이 보인다 |
| 미리보기 | PR 의 Vercel 댓글 | 미리보기 주소가 있고, 그 주소의 `/health` 도 「연결됨」 |
| 비용 | Vercel **Settings** → **Billing**, Neon 콘솔 **Billing** | Hobby · Free |

`/health` 가 「연결 안 됨」이면 화면의 안내 문구를 읽는다 — 「설정되지 않았습니다」는 2 의 6 · 7 을, 「닿지 못했습니다」는
Vercel 배포의 **Logs** 에서 아래 두 꼴의 줄을 찾는다. 로그에는 접속 정보가 남지 않는다.

| 로그 | 뜻 | 예 |
|---|---|---|
| `DB 연결 실패: <코드>` | DB 까지 닿지 못했다 — 네트워크 · 주소 · 인증서 | `ECONNREFUSED` · `ENOTFOUND` |
| `DB 질의 실패: <코드> <등급> <메시지>` | DB 가 받아 놓고 거절했다 — 메시지가 원인을 말한다 | 무료 계산 시간 소진, 비밀번호 틀림(`28P01`) |

Hobby 요금제는 로그를 짧게만 보관한다. 지난 실패는 아래 「알림」의 실행 기록에 남는다.

## 알림

GitHub Actions 의 「데모 상태 확인」(`.github/workflows/health-check.yml`)이 하루 4번(한국 시간 3:17 · 9:17 · 15:17 · 21:17)
데모의 `/health` 를 열어 두 가지를 본다. 하나라도 아니면 그 실행이 실패하고, GitHub 가 메일을 보낸다.

1. 「연결됨」 글자 — DB 가 끊겼거나 데모가 안 뜨면 걸린다.
2. 화면의 「커밋」이 `main` 의 최신 커밋과 같은가 — 머지 뒤 빌드가 실패했거나, 되돌린 뒤 Undo Rollback 을 잊어 데모가
   옛 버전이면 걸린다. 머지 직후라 빌드 중일 수 있어 최대 10분 기다린 뒤 판정한다.

- 받는 사람은 예약 실행이면 이 파일의 예약을 마지막으로 바꿔 머지한 계정, 손으로 돌린 실행이면 돌린 계정이다. GitHub
  **Settings** → **Notifications** → **Actions** 에서 실패 알림이 켜져 있는지 본다.
- 메일이 실제로 오는지 보려면 **Run workflow** 의 주소 칸에 없는 주소(예: `https://erp-2-eta.vercel.app/nope`)를 넣고 돌린다.
  실행이 실패하고 메일이 와야 한다.
- 실패한 날의 화면 글자는 그 실행 기록에 남는다(GitHub 가 90일 보관). **Actions** 탭 → 「데모 상태 확인」에서 본다.
- 바로 확인하고 싶으면 같은 화면의 **Run workflow** 로 한 번 돌린다.
- 레포를 공개로 바꾸면 오래 활동이 없을 때 GitHub 가 예약 실행을 멈출 수 있다 — 조각 「포트폴리오 정리」에서 확인한다.

## 되돌리기

배포한 데모가 잘못됐으면 바로 앞 배포로 곧바로 되돌린다. 코드를 고치지 않아도 된다.

1. **Deployments** 탭에서 지금 데모로 나가 있는 배포 **바로 아래의** Production 배포를 찾는다 — Hobby 요금제는 바로 앞 운영
   배포로만 되돌릴 수 있다. 지금 배포의 메뉴에서는 단추가 꺼져 있다(「already in Production」).
2. 그 배포의 **⋯** → **Instant Rollback** 을 누르고 확인한다.
3. 데모의 `/health` 를 열어 「배포 버전」의 커밋이 되돌린 배포의 것인지 본다.
4. **되돌린 동안에는 새로 머지해도 데모가 바뀌지 않는다.** 고친 코드를 머지한 뒤 Deployments 탭 위쪽의 **Undo Rollback**
   (또는 최신 배포의 **⋯** → **Promote to Production**)을 눌러야 새 배포가 데모로 나간다. 누른 뒤 3 처럼 커밋을 본다.

두 단계 이상 앞으로 가야 하면 Instant Rollback 으로는 안 된다 — 잘못 들어온 PR 들을 되돌리는 PR 을 만들어 머지한다(Claude 에게
「PR #○ 를 되돌려 줘」라고 하면 된다).

DB 의 데이터는 되돌리기로 돌아가지 않는다 — 배포만 이전 것으로 바뀐다. DB 를 바꾸는 마이그레이션의 되돌림은 그것을
처음 다는 조각 「기준정보」가 정한다(`docs/schema.md`).
