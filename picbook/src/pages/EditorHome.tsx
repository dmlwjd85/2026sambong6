import { Canvas } from '../components/Canvas'
import { Editor } from '../components/Editor'

export default function EditorHome() {
  return (
    <div className="h-full w-full">
      <div className="h-full w-full grid grid-cols-1 lg:grid-cols-2">
        <Editor />
        <Canvas />
      </div>
    </div>
  )
}
