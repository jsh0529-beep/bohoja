export type ComfortCategory='all'|'patient'|'caregiver'|'waiting'|'together';
export type ComfortMessage={id:string;category:Exclude<ComfortCategory,'all'>;title:string;body:string};

export const comfortCategories:Array<{id:ComfortCategory;label:string}>=[
  {id:'all',label:'모두'},{id:'patient',label:'환자에게'},{id:'caregiver',label:'보호자에게'},{id:'waiting',label:'기다리는 시간'},{id:'together',label:'함께하는 가족'},
];

export const comfortMessages:ComfortMessage[]=[
  {id:'patient-1',category:'patient',title:'천천히 가도 괜찮아요',body:'오늘 해야 할 일은 오늘을 지나가는 것만으로도 충분할 수 있어요.'},
  {id:'patient-2',category:'patient',title:'당신의 속도를 존중해요',body:'괜찮은 척하지 않아도, 설명할 힘이 없어도 괜찮아요.'},
  {id:'patient-3',category:'patient',title:'지금의 마음도 자연스러워요',body:'두렵고 답답한 감정은 약해서가 아니라 중요한 시간을 지나고 있기 때문이에요.'},
  {id:'patient-4',category:'patient',title:'작은 편안함을 찾아봐요',body:'따뜻한 물 한 모금, 편한 자세 하나도 오늘을 돌보는 일이에요.'},
  {id:'patient-5',category:'patient',title:'당신은 혼자가 아니에요',body:'말이 없어도 곁을 지키는 마음들이 함께하고 있어요.'},
  {id:'caregiver-1',category:'caregiver',title:'쉬는 것도 돌봄이에요',body:'잠시 앉아 숨을 고르는 시간은 돌봄을 멈추는 일이 아니에요.'},
  {id:'caregiver-2',category:'caregiver',title:'지친 건 오래 애썼다는 뜻이에요',body:'모든 것을 잘해내지 못한 것 같아도, 이미 많은 일을 해오셨어요.'},
  {id:'caregiver-3',category:'caregiver',title:'혼자 다 맡지 않아도 괜찮아요',body:'도움을 요청하는 것은 부담을 넘기는 일이 아니라 돌봄을 이어가는 방법이에요.'},
  {id:'caregiver-4',category:'caregiver',title:'오늘의 나에게도 친절하게',body:'환자에게 건네는 다정한 말을 오늘은 나 자신에게도 건네보세요.'},
  {id:'caregiver-5',category:'caregiver',title:'완벽한 보호자일 필요는 없어요',body:'곁에 있으려는 마음과 다시 살피는 태도만으로도 충분히 소중해요.'},
  {id:'waiting-1',category:'waiting',title:'기다리는 시간도 지나가요',body:'결과를 앞당길 수는 없어도, 지금 이 순간의 숨은 천천히 돌볼 수 있어요.'},
  {id:'waiting-2',category:'waiting',title:'지금은 답을 몰라도 괜찮아요',body:'아직 정해지지 않은 일을 미리 모두 견디려 하지 않아도 돼요.'},
  {id:'waiting-3',category:'waiting',title:'발밑의 바닥을 느껴보세요',body:'두 발을 바닥에 붙이고, 의자가 몸을 받쳐주는 감각에 잠시 머물러 보세요.'},
  {id:'waiting-4',category:'waiting',title:'한 번에 한 순간만',body:'다음 검사와 다음 결정보다 지금의 한 호흡에만 마음을 두어도 괜찮아요.'},
  {id:'waiting-5',category:'waiting',title:'아무것도 하지 않는 시간도 필요해요',body:'정보를 찾고 결정하는 일을 잠시 내려놓아도 괜찮습니다.'},
  {id:'together-1',category:'together',title:'완벽한 말보다 곁에 있는 마음',body:'무슨 말을 해야 할지 몰라도 함께 앉아 있는 것만으로 전해지는 마음이 있어요.'},
  {id:'together-2',category:'together',title:'서로 다른 방식도 괜찮아요',body:'누군가는 말로, 누군가는 행동으로 걱정하고 사랑할 수 있어요.'},
  {id:'together-3',category:'together',title:'고마움을 짧게 전해보세요',body:'오늘 함께해줘서 고마워. 그 한마디가 가족의 하루를 가볍게 할 수 있어요.'},
  {id:'together-4',category:'together',title:'돌봄은 나누면 이어져요',body:'작은 일 하나씩 맡아주는 것이 서로를 오래 지켜주는 힘이 됩니다.'},
  {id:'together-5',category:'together',title:'마음의 속도는 달라도 괜찮아요',body:'같은 상황에서도 각자 다르게 느낄 수 있다는 것을 기억해 주세요.'},
];

export const shareTemplates=[
  {id:'to-patient',label:'환자에게',text:'오늘은 힘내라는 말보다 곁에 있겠다는 말을 전하고 싶어요. 필요한 만큼 천천히 가요.'},
  {id:'to-caregiver',label:'보호자에게',text:'혼자 다 맡지 않아도 괜찮아요. 오늘 내가 도울 일을 편하게 알려주세요.'},
  {id:'thanks',label:'함께한 가족에게',text:'오늘 함께해줘서 고마워요. 당신이 나눠준 시간이 큰 힘이 됐어요.'},
];
