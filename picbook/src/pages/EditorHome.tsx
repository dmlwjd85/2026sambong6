import { Canvas } from '../components/Canvas'
import { Editor } from '../components/Editor'
import { WordSceneToolkit } from '../components/WordSceneToolkit'

export default function EditorHome() {
  return (
    <div className="h-full w-full">
      <div className="h-full w-full grid grid-cols-1 xl:grid-cols-[1fr_1fr_420px]">
        <Editor />
        <Canvas />
        <WordSceneToolkit />
      </div>
    </div>
  )
}
