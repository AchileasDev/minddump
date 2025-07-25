import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useRouter } from 'next/router';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';

export interface User extends SupabaseUser {
  role?: string;
  subscription_status?: string;
  trial_ends_at?: string;
  notifications_enabled?: boolean;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<any>;
  signUp: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  startTrial: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();

  const fetchUserProfile = useCallback(async (authUser: SupabaseUser) => {
    try {
      setLoading(true);
      const response = await api.getUserProfile();
      
      if (response.success && response.data) {
        setUser({ ...authUser, ...response.data });
      } else {
        console.error('Error fetching profile:', response.message);
        setUser(authUser as User); // Fallback to auth user
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
      setUser(authUser as User); // Fallback to auth user
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await fetchUserProfile(session.user);
    }
  }, [fetchUserProfile]);

  useEffect(() => {
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await fetchUserProfile(session.user);
      } else {
        setLoading(false);
      }
    };
    getInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user;
      if (event === 'SIGNED_IN' && currentUser) {
        await fetchUserProfile(currentUser);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        router.push('/login');
      }
    });

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [fetchUserProfile, router]);

  const signIn = (email: string, password: string) => {
    return supabase.auth.signInWithPassword({ email, password });
  };
  
  const signUp = (email: string, password: string) => {
    return supabase.auth.signUp({ email, password });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const startTrial = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      throw new Error('You must be logged in to start a trial.');
    }
    
    const promise = api.startTrial().then((response) => {
      if (response.success) {
        refreshUser(); // Refetch profile on success
        return response;
      } else {
        throw new Error(response.message || 'Failed to start trial');
      }
    });

    await toast.promise(promise, {
      loading: 'Starting your trial...',
      success: (data) => data.message || 'Trial started successfully!',
      error: (err) => err.message || 'Could not start trial.',
    });
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    startTrial,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 