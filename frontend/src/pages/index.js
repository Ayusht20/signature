import { useState } from 'react';
import { useRouter } from 'next/router';

export default function AuthGate() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
    
    try {
      let response;
      if (isRegister) {
        response = await fetch(`https://ayushtrilokchandani-signature.hf.space/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
      } else {
        // OAuth2 Password Form Request parameters mapping
        const formBody = new URLSearchParams();
        formBody.append('username', formData.email);
        formBody.append('password', formData.password);

        response = await fetch('https://ayushtrilokchandani-signature.hf.space/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formBody,
        });
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Authentication execution failure');

      if (!isRegister) {
        localStorage.setItem('token', data.access_token);
        localStorage.setItem('user', JSON.stringify(data.user));
        router.push('/dashboard');
      } else {
        alert('Registration complete! Please authenticate now.');
        setIsRegister(false);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-md w-full max-w-md border border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-6">
          {isRegister ? 'Create Secure Account' : 'Sign In to Workspace'}
        </h1>
        
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 font-medium">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <input
              type="text"
              placeholder="Full Name"
              required
              // className="w-full p-3 border rounded-xl focus:outline-none focus:border-indigo-600 text-sm "
              className="w-full border border-slate-600 p-3 rounded-xl bg-white text-slate-900 font-bold focus:outline-none focus:border-indigo-600 shadow-inner"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          )}
          <input
            type="email"
            placeholder="Email Address"
            required
            className="w-full border border-slate-600 p-3 rounded-xl bg-white text-slate-900 font-bold focus:outline-none focus:border-indigo-600 shadow-inner"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
          <input
            type="password"
            placeholder="Password"
            required
            className="w-full border border-slate-600 p-3 rounded-xl bg-white text-slate-900 font-bold focus:outline-none focus:border-indigo-600 shadow-inner"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white p-3 rounded-xl font-semibold transition text-sm">
            {isRegister ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-500 mt-6 cursor-pointer hover:underline" onClick={() => setIsRegister(!isRegister)}>
          {isRegister ? 'Already have an account? Log in' : 'New user? Create an enterprise profile'}
        </p>
      </div>
    </div>
  );
}