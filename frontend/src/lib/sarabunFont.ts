// The one weight embedded in every jsPDF export on this app: without it Thai
// text falls back to Helvetica and drops out of the file entirely. Cached
// module-wide, so a second export does not refetch the ~200KB face.
let sarabunBase64: string | null = null;

export async function loadSarabun() {
  if (sarabunBase64) return sarabunBase64;
  const response = await fetch("/fonts/Sarabun-Regular.ttf");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  sarabunBase64 = btoa(binary);
  return sarabunBase64;
}
