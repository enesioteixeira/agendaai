// Hash de senha com PBKDF2-SHA256 via WebCrypto (crypto.subtle).
//
// HISTÓRICO: a 1ª implementação usava argon2id via hash-wasm, mas o Cloudflare
// Workers PROÍBE WebAssembly.compile() dinâmico em produção ("Wasm code
// generation disallowed by embedder") — e mesmo com import estático de WASM,
// argon2id (19 MiB, t=2) estoura o limite de CPU do plano gratuito (10 ms).
// PBKDF2 via crypto.subtle roda NATIVO (não conta como CPU de JS) e é a
// abordagem documentada pela Cloudflare p/ senhas em Workers; WebCrypto existe
// igual em Workers e Node — o mesmo código roda nos dois.
//
// O runtime da Cloudflare limita PBKDF2 a 100_000 iterações (abaixo do alvo
// OWASP de 600k p/ SHA-256 — trade-off aceito e documentado). O formato do
// hash é VERSIONADO (prefixo $pbkdf2-sha256$i=...): quando houver runtime sem
// teto (worker Node/plano pago), migra-se p/ argon2id com re-hash transparente
// no próximo login — verificarSenha lê os parâmetros do próprio hash.

const ITERACOES = 100_000;
const TAMANHO_HASH_BITS = 256;
const TAMANHO_SALT_BYTES = 16;

function paraBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function deBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function derivar(senha: string, salt: Uint8Array, iteracoes: number): Promise<Uint8Array> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(senha),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iteracoes },
    chave,
    TAMANHO_HASH_BITS,
  );
  return new Uint8Array(bits);
}

// Comparação em tempo constante — timingSafeEqual não existe no WebCrypto.
function igualConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function hashSenha(senha: string): Promise<string> {
  if (senha.length < 8) {
    throw new Error("Senha deve ter ao menos 8 caracteres.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(TAMANHO_SALT_BYTES));
  const hash = await derivar(senha, salt, ITERACOES);
  // Formato PHC-like versionado: $pbkdf2-sha256$i=<iterações>$<salt b64>$<hash b64>
  return `$pbkdf2-sha256$i=${ITERACOES}$${paraBase64(salt)}$${paraBase64(hash)}`;
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  try {
    const partes = hash.split("$");
    // ["", "pbkdf2-sha256", "i=100000", salt, hash]
    if (partes.length !== 5 || partes[1] !== "pbkdf2-sha256") return false;
    const iteracoes = Number(partes[2]?.replace("i=", ""));
    if (!Number.isInteger(iteracoes) || iteracoes < 1) return false;
    const salt = deBase64(partes[3] ?? "");
    const esperado = deBase64(partes[4] ?? "");
    const calculado = await derivar(senha, salt, iteracoes);
    return igualConstante(calculado, esperado);
  } catch {
    return false;
  }
}
