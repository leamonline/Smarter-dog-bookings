import { useContext } from 'react';
import { AuthContext } from '../context/authContextValue';

export function useAuth() {
    return useContext(AuthContext);
}
