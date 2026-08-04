import React, { useState } from 'react';
import { UserProfileInfo } from '../types/music';
import { User, CheckCircle, Save, Loader2 } from 'lucide-react';

interface ProfileTabProps {
  userProfile: UserProfileInfo;
  setUserProfile: ((newProfile: UserProfileInfo) => void) | React.Dispatch<React.SetStateAction<UserProfileInfo>>;
}

export const ProfileTab: React.FC<ProfileTabProps> = ({
  userProfile,
  setUserProfile
}) => {
  const [formData, setFormData] = useState<UserProfileInfo>({ ...userProfile });
  const [isSavedNotice, setIsSavedNotice] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingProfile(true);
    try {
      await setUserProfile({ ...formData });
      setIsSavedNotice(true);
      setTimeout(() => setIsSavedNotice(false), 2500);
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div style={{ padding: '2.5rem 1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2.5rem' }}>
        <span className="badge-neo badge-lime">USER IDENTITY & METRICS</span>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 800, textTransform: 'uppercase', lineHeight: 1, marginTop: '0.4rem' }}>
          USER <span style={{ color: 'var(--accent-lime)' }}>PROFILE</span>
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          Manage your account details, country, age, and personal preferences.
        </p>
      </div>

      <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        <div className="tactile-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.75rem' }}>
            <User size={20} style={{ color: 'var(--accent-lime)' }} />
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 800 }}>
              ACCOUNT INFORMATION
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Full Name */}
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
                FULL NAME
              </label>
              <input
                type="text"
                className="input-neo"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Victoria Legrand"
                required
              />
            </div>

            {/* Email Address */}
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span>EMAIL ADDRESS</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(UNCHANGEABLE)</span>
              </label>
              <input
                type="email"
                className="input-neo"
                value={formData.email}
                readOnly
                disabled
                style={{ backgroundColor: 'var(--bg-primary)', opacity: 0.7, cursor: 'not-allowed' }}
              />
            </div>

            {/* Country */}
            <div>
              <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
                COUNTRY
              </label>
              <input
                type="text"
                className="input-neo"
                value={formData.country}
                onChange={e => setFormData(prev => ({ ...prev, country: e.target.value }))}
                placeholder="Pakistan"
                required
              />
            </div>

            {/* Age and Gender Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
                  AGE
                </label>
                <input
                  type="number"
                  min="13"
                  max="120"
                  className="input-neo"
                  value={formData.age || ''}
                  onChange={e => setFormData(prev => ({ ...prev, age: e.target.value ? parseInt(e.target.value) : undefined }))}
                  placeholder="24"
                />
              </div>
              <div>
                <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 700, display: 'block', marginBottom: '0.4rem' }}>
                  GENDER
                </label>
                <select
                  className="input-neo"
                  value={formData.gender || ''}
                  onChange={e => setFormData(prev => ({ ...prev, gender: e.target.value }))}
                  style={{ cursor: 'pointer' }}
                >
                  <option value="">Select...</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Save Button */}
        <button
          type="submit"
          className="btn-neo btn-neo-lime"
          disabled={isSavingProfile}
          style={{ padding: '0.9rem', fontSize: '1rem', justifyContent: 'center', opacity: isSavingProfile ? 0.7 : 1, cursor: isSavingProfile ? 'not-allowed' : 'pointer' }}
        >
          {isSavingProfile ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <Loader2 size={18} className="animate-spin" /> SAVING PROFILE...
            </span>
          ) : isSavedNotice ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={18} /> PROFILE SAVED!
            </span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
              <Save size={18} /> SAVE PROFILE CHANGES
            </span>
          )}
        </button>
      </form>
    </div>
  );
};
