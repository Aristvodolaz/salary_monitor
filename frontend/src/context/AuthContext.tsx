import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authAPI, usersAPI } from '../services/api';

interface User {
  id: number;
  employeeId: string;
  fio: string;
  role: string;
  warehouseId: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (employeeId: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Проверка наличия токена при загрузке
    const token = localStorage.getItem('access_token');
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, []);

  const loadUser = async () => {
    try {
      const response = await usersAPI.getMe();
      setUser(response.data);
    } catch (error) {
      localStorage.removeItem('access_token');
    } finally {
      setLoading(false);
    }
  };

  const login = async (employeeId: string) => {
    try {
      const response = await authAPI.loginByBarcode(employeeId);
      const { access_token, user: userData } = response.data;
      
      localStorage.setItem('access_token', access_token);
      setUser(userData);
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Ошибка авторизации');
    }
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

