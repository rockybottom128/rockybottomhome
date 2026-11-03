export type ReportDeliveryMode='test'|'resend'|'unavailable';
export function reportModeNotice(mode:ReportDeliveryMode){
 return mode==='test'?'TEST MODE — reports are saved locally only. No email is sent and nothing will arrive in the recipient’s inbox.':mode==='resend'?'REAL EMAIL MODE — sending contacts the email provider. Provider acceptance does not confirm inbox delivery.':'Email delivery is not configured. Reports cannot be sent.';
}
export function reportDeliveryLabel(status:string,localTest:boolean){
 if(status==='sent')return localTest?'Saved locally in test mode — NO email sent':'Accepted by email provider — inbox delivery unconfirmed';
 return ({pending:'Not sent yet',failed:'Not sent — check configuration, recipient access or limits before retrying',sending:'Sending or outcome unknown — do not resend',uncertain:'Outcome unknown — check provider before any resend'} as Record<string,string>)[status]??'Unknown delivery status';
}
