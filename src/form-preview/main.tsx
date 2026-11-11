import { createRoot } from 'react-dom/client'
import { ArrowDown } from 'lucide-react'
import { FMark } from '../components/FittArtwork'
import FormStudioContent from '../components/form-guide/FormStudioContent'
import '../app/globals.css'
import '../styles.css'

function FormStudioPreview() {
  return (
    <div className="form-study">
      <header className="form-study__header">
        <a href="#movement" aria-label="Fitt form studio" className="form-study__brand">
          <FMark />
          <span>
            fitt<span>.</span>
          </span>
        </a>
        <span className="form-study__edition">
          FORM STUDIO <i /> EXERCISE STUDIES
        </span>
        <a href="#the-system" className="form-study__about">
          The approach <ArrowDown size={14} />
        </a>
      </header>
      <main>
        <FormStudioContent />
      </main>
      <footer className="form-study__footer">
        <span>Fitt · Your pace. Your progress.</span>
        <span>Form studio / Design preview</span>
      </footer>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<FormStudioPreview />)
