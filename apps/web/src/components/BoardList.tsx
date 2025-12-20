import type { Board } from '../api/boards'

type BoardListProps = {
  boards: Board[]
  activeBoardId?: string | null
  onSelect?: (boardId: string | null) => void
}

const BoardList = ({ boards, activeBoardId, onSelect }: BoardListProps) => (
  <ul className="board-list">
    <li>
      <button
        type="button"
        className={
          activeBoardId ? 'board-item' : 'board-item board-item--active'
        }
        onClick={() => onSelect?.(null)}
        aria-current={activeBoardId ? undefined : 'true'}
      >
        <div className="board-name">All Boards</div>
        <div className="board-desc">Latest posts across campus.</div>
      </button>
    </li>
    {boards.map((board) => (
      <li key={board.id}>
        <button
          type="button"
          className={
            board.id === activeBoardId
              ? 'board-item board-item--active'
              : 'board-item'
          }
          onClick={() => onSelect?.(board.id)}
          aria-current={board.id === activeBoardId ? 'true' : undefined}
        >
          <div className="board-name">{board.name}</div>
          <div className="board-desc">{board.description}</div>
        </button>
      </li>
    ))}
  </ul>
)

export default BoardList
