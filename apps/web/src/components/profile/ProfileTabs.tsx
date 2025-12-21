type TabItem = {
  id: string
  label: string
}

type ProfileTabsProps = {
  tabs: TabItem[]
  activeTab: string
  onChange: (tabId: string) => void
}

const ProfileTabs = ({ tabs, activeTab, onChange }: ProfileTabsProps) => (
  <div className="profile-tabs" role="tablist">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={activeTab === tab.id}
        className={activeTab === tab.id ? 'profile-tab profile-tab--active' : 'profile-tab'}
        onClick={() => onChange(tab.id)}
      >
        {tab.label}
      </button>
    ))}
  </div>
)

export default ProfileTabs
