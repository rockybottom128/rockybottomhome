export function recoveryLabel(outcome:string|null|undefined):string|null {
 return ({accepted:'Owner verified provider acceptance — inbox delivery unconfirmed',not_accepted:'Owner verified provider did not accept — no resend enabled',unknown:'Reviewed — outcome still unknown; do not resend'} as Record<string,string>)[outcome??'']??null;
}
