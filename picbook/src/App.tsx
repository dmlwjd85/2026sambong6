import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import EditorHome from './pages/EditorHome'
import DraftPages from './pages/DraftPages'
import DirectingPage from './pages/DirectingPage'
import LibraryPage from './pages/LibraryPage'
import ReadPicBookPage from './pages/ReadPicBookPage'
import HomeRedirect from './pages/HomeRedirect'
import StorePage from './pages/StorePage'
import MasterHome from './pages/MasterHome'
import SceneTimelinePage from './pages/SceneTimelinePage'
import { MasterRoute } from './components/MasterRoute'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/store" element={<StorePage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/read/:picBookId" element={<ReadPicBookPage />} />

        <Route
          path="/master"
          element={
            <MasterRoute>
              <MasterHome />
            </MasterRoute>
          }
        />
        <Route
          path="/editor"
          element={
            <MasterRoute>
              <EditorHome />
            </MasterRoute>
          }
        />
        <Route
          path="/draft/pages"
          element={
            <MasterRoute>
              <DraftPages />
            </MasterRoute>
          }
        />
        <Route
          path="/editor/scenes"
          element={
            <MasterRoute>
              <SceneTimelinePage />
            </MasterRoute>
          }
        />
        <Route
          path="/direct/:sentenceId"
          element={
            <MasterRoute>
              <DirectingPage />
            </MasterRoute>
          }
        />
      </Route>
    </Routes>
  )
}
