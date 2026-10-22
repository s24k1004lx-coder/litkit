import { createContext, useContext } from 'react';

export interface AuthContextValue {
  /** パスワード認証が有効か（無効＝ローカル利用ならログアウトは不要） */
  required: boolean;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue>({ required: false, logout: () => {} });

export const useAuth = () => useContext(AuthContext);
