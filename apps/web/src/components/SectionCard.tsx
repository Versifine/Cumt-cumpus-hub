import type { ReactNode } from 'react'

type SectionCardProps = {
  title: string
  children: ReactNode
  actions?: ReactNode
  className?: string
}

const SectionCard = ({
  title,
  children,
  actions,
  className,
}: SectionCardProps) => {
  const classes = ['section-card', className].filter(Boolean).join(' ')

  return (
    <section className={classes}>
      <div className="section-card__header">
        <h2 className="section-card__title">{title}</h2>
        {actions ? <div className="section-card__actions">{actions}</div> : null}
      </div>
      <div className="section-card__content">{children}</div>
    </section>
  )
}

export default SectionCard
