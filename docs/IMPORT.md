# 거래 정리 프롬프트와 가져오기 초안 형식

현재 앱에서는 엑셀에서 복사한 기본 열의 TSV를 거래원장 표에 붙여넣을 수 있다. 아래 JSON은 2차 가져오기/3차 외부 연결에서 사용할 **초안 규격**이며, 지금 JSON을 ChatGPT에 작성하게 해도 앱 DB에 자동 저장되지 않는다. CSV/XLSX/JSON 업로드·승인 화면과 외부 인증 API는 아직 구현하지 않았다.

## ChatGPT에 사용할 프롬프트

```text
첨부하거나 아래에 제공한 카드/계좌 거래내역만 정리해 주세요.
제공하지 않은 파일·과거 대화·개인 금액을 읽었다고 가정하거나 추정하지 마세요.

귀속은 상화/하율/기타입니다. 기타는 실제 귀속이며 미확인이라는 뜻이 아닙니다.
누구의 거래인지 불명확하면 owner를 null로 남기고 review_notes에 확인 질문을 적어 주세요.
날짜·금액·분류·결제수단·계좌도 근거가 없으면 null로 남기고 추정하지 마세요.
통화는 원화 정수이며 거래일을 YYYY-MM-DD로 기록하세요. 원문 일자를 임의 시간대 변환하지 마세요.

유형은 income(수입), expense(소비지출), saving(저축·투자),
loan_principal(대출원금), transfer(내부이체), refund(환불),
settlement(카드대금 정산), loan_received(대출금 수령)입니다.
대출이자는 expense이고 대출받은 원금은 income이 아닙니다.
소비 내역과 카드대금 출금을 각각 expense로 중복 분류하지 마세요.
생활비 계좌 이체와 실제 소비를 이중 지출로 분류하지 마세요.
환불의 원거래 ID는 실제 제공된 ID만 사용하고, 없으면 null로 남겨 검토하게 하세요.
파일 내 같은 날짜·금액은 중복 후보일 뿐입니다. 임의 삭제하지 마세요.

엑셀의 합계·소계·예산·자산잔액·미래 전망은 거래로 출력하지 마세요.
거래 목록인지 계획/집계 파일인지 먼저 구분하고, 거래로 해석할 수 없는 영역은 설명하세요.
예정/확정/취소 상태에 대한 근거가 없으면 null로 남겨 주세요.
source_transaction_id는 원본 파일에 있을 때만 기록하세요.

출력은 schema/import-draft.schema.json 규격에 맞는 JSON 초안입니다.
version=1, records 배열에 각 거래를 넣으세요.
승인·저장되었다고 말하지 마세요. 앱에서 수정·검토·최종 승인해야 저장됩니다.
```

## 가상 예시

실제 개인 거래가 아닌 형식 설명용 자료다.

```json
{
  "version": 1,
  "source_type": "transaction_list",
  "records": [
    {
      "date": "2026-01-02",
      "owner": null,
      "kind": "expense",
      "major": "생활",
      "minor": "식비",
      "description": "가상 형식 예시",
      "amount": 1000,
      "payment_method": null,
      "account": null,
      "target_account": null,
      "status": "confirmed",
      "memo": "형식 설명용",
      "source_transaction_id": null,
      "original_transaction_id": null,
      "review_notes": ["귀속을 상화·하율·기타 중 확인해 주세요."]
    }
  ]
}
```

현재 표 붙여넣기의 열 순서와 값은 `docs/SETUP.md`를 참고한다. CSV 내보내기는 거래ID·예정금액·원거래ID까지 포함한 보관 형식으로, 현재 표에 그대로 붙여넣기 위한 형식은 아니다.

## 직접 연결 단계의 요구사항

쿠키 기반의 현재 내부 API를 인증 없는 외부 쓰기 API로 노출하지 않는다. 향후 직접 연결 구현 시점에 OpenAI 공식 문서에서 지원되는 연결 방식을 확인해야 한다. 별도 OAuth/가족 권한 검사, 서버 초안 보관, 미리보기, 승인된 내용의 해시, 변경 시 재승인, 원본 ID 우선 중복 후보 검사, 고정비 연결 선택, 최종 저장의 idempotency 키, OpenAPI 명세와 통합 테스트가 필요하다. 이 단계의 API 명세나 인증 설정은 아직 구현되지 않았으므로 연결 완료로 보고하지 않는다.
