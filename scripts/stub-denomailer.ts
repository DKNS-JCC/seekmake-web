// denomailer falso: registra lo que se habría enviado en vez de abrir un SMTP.
// Permite comprobar el asunto, el destinatario y —lo importante— que el PDF
// va realmente adjunto.

// deno-lint-ignore-file no-explicit-any

export const enviados: any[] = [];
export let fallarEnvio = false;

export function resetMail(fallar = false) {
  enviados.length = 0;
  fallarEnvio = fallar;
}

export class SMTPClient {
  constructor(_cfg: any) {}
  // deno-lint-ignore require-await
  async send(msg: any) {
    if (fallarEnvio) throw new Error('SMTP caído');
    enviados.push(msg);
  }
  // deno-lint-ignore require-await
  async close() {}
}
