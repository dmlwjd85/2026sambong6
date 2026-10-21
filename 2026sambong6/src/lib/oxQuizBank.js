/** OX 퀴즈 문제 은행 컬렉션. firestore.rules 와 같은 경로입니다. */
export const OX_QUIZ_BANK_COLLECTION = 'oxQuizBank';
/** 문제 묶음 전체를 한 문서에 둘 때의 문서 ID. */
export const OX_QUIZ_BANK_DOC_ID = 'bank';

export function oxQuizBankCollectionPath(classId) {
    return `artifacts/${String(classId || '')}/public/data/${OX_QUIZ_BANK_COLLECTION}`;
}

export function oxQuizBankDocPath(classId, docId = OX_QUIZ_BANK_DOC_ID) {
    return `${oxQuizBankCollectionPath(classId)}/${String(docId || OX_QUIZ_BANK_DOC_ID)}`;
}
