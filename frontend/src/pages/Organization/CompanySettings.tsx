import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { PageHeader } from '../../components/ui';
import OrgProfileForm from './OrgProfileForm';
import BankAccountsTab from './BankAccountsTab';
import ListsTab from './ListsTab';
import MailSettingsTab from './MailSettingsTab';
import NumberSeriesTab from './NumberSeriesTab';
import StorageSettingsTab from './StorageSettingsTab';
import StatutoryProfileTab from '../Payroll/StatutoryProfileTab';

// Identity and branding are the Super Admin's; HR keeps the registrations,
// signatories, bank accounts and lists that payroll depends on.
const TABS = [
  { key: 'identity', label: 'Identity', ownerOnly: true },
  { key: 'registrations', label: 'Registrations', ownerOnly: false },
  { key: 'signatories', label: 'Signatories', ownerOnly: false },
  { key: 'bank', label: 'Bank accounts', ownerOnly: false },
  { key: 'lists', label: 'Lists', ownerOnly: false },
  { key: 'numbering', label: 'Numbering', ownerOnly: false },
  { key: 'email', label: 'Email', ownerOnly: true },
  { key: 'storage', label: 'File storage', ownerOnly: true },
  { key: 'branding', label: 'Branding', ownerOnly: true },
];

// Everything about the company in one place.
export default function CompanySettings() {
  const role = useAuthStore(state => state.user?.role) || 'SUPER_ADMIN';
  const owner = role === 'SUPER_ADMIN';
  const tabs = TABS.filter(t => owner || !t.ownerOnly);
  const [params, setParams] = useSearchParams();
  const tab = tabs.some(t => t.key === params.get('tab')) ? params.get('tab')! : tabs[0].key;

  return (
    <>
      <PageHeader
        title="Company Settings"
        subtitle="Identity, registrations, signatories, bank accounts and the lists that forms pick from."
      />

      <div className="tabs" role="tablist">
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setParams({ tab: t.key })}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'identity' && <OrgProfileForm section="identity" />}
      {tab === 'registrations' && <StatutoryProfileTab section="registrations" />}
      {tab === 'signatories' && (
        <>
          {owner && <OrgProfileForm section="signatory" />}
          <StatutoryProfileTab section="signatories" />
        </>
      )}
      {tab === 'bank' && <BankAccountsTab />}
      {tab === 'lists' && <ListsTab />}
      {tab === 'numbering' && <NumberSeriesTab />}
      {tab === 'email' && <MailSettingsTab />}
      {tab === 'storage' && <StorageSettingsTab />}
      {tab === 'branding' && <OrgProfileForm section="branding" />}
    </>
  );
}
