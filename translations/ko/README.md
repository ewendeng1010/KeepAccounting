# KeepAccounting

Node.js 및 SQLite 기반의 간결한 가계부 애플리케이션으로 다음을 지원합니다:

- 사용자 등록 및 로그인
- 수입/지출 기록 추가
- 총수입, 총지출, 잔액 표시
- 날짜 범위별 기록 필터링
- SQLite 데이터베이스에 데이터 영속화

## 시작 방법

```bash
node server.js
```

시작 후 다음 주소로 접속합니다:

```text
http://localhost:3000
```

## 데이터베이스 위치

기본 데이터베이스 파일은 다음 위치에 생성됩니다:

```text
data/accounting.db
```

데이터베이스 파일 경로를 사용자 지정하려면 시작 시 `DB_PATH` 환경 변수를 전달할 수 있습니다.