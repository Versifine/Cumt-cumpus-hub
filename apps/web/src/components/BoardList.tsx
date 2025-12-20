import type { Board } from '../api/boards'

type BoardListProps = {
  boards: Board[]
}

const BoardList = ({ boards }: BoardListProps) => (
  <ul className="board-list">
    {boards.map((board) => (
      <li key={board.id} className="board-item">
        <div className="board-name">{board.name}</div>
        <div className="board-desc">{board.description}</div>
      </li>
    ))}
  </ul>
)

export default BoardList
