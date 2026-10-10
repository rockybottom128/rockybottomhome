export async function post(path:string,data:Record<string,unknown>) {
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),credentials:'same-origin'});
 const result=await response.json() as {error?:string|{message?:string};message?:string};
 if(!response.ok)throw new Error((typeof result.error==='string'?result.error:result.error?.message)||result.message||'Unable to complete this request.');
 return result;
}
export function field(id:string):HTMLInputElement {return document.getElementById(id) as HTMLInputElement;}
export function message(id:string,text:string) {document.getElementById(id)!.textContent=text;}
export async function busy(button:HTMLButtonElement,action:()=>Promise<void>,resultId:string) {
 button.disabled=true;button.setAttribute('aria-busy','true');const text=button.textContent;button.textContent='Please wait…';
 try{await action();}catch(error){message(resultId,error instanceof Error?error.message:'Please try again.');}
 finally{button.disabled=false;button.removeAttribute('aria-busy');button.textContent=text;}
}
