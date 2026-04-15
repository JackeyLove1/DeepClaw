import { AppRouter } from './router'
import { Toaster } from 'sonner'

const App = () => (
  <>
    <AppRouter />
    <Toaster richColors position="top-center" />
  </>
)

export default App
