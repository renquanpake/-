// Temporary boot entry — M3 replaces this with Phaser scene management.
const status = document.getElementById('boot-status')!

interface BankMeta { subject: string; chapters: number; questions: number }

async function loadMeta(subject: string): Promise<BankMeta | null> {
  try {
    const res = await fetch(`./questionbank/${subject}.json`)
    if (!res.ok) return null
    const bank = await res.json()
    return {
      subject,
      chapters: Array.isArray(bank.chapters) ? bank.chapters.length : 0,
      questions: Array.isArray(bank.questions) ? bank.questions.length : 0
    }
  } catch {
    return null
  }
}

async function boot() {
  const metas = await Promise.all(['math', 'env'].map(loadMeta))
  const ok = metas.filter(Boolean) as BankMeta[]
  if (ok.length === 0) {
    status.textContent = 'Question bank loading failed — please run the build pipeline first'
    return
  }
  status.innerHTML = ok
    .map(m => `${m.subject}: ${m.chapters} chapters / ${m.questions} questions`)
    .join('<br>') + '<br>Core logic M2 in progress…'
}

boot()

export {}
