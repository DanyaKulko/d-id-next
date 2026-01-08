"use client";

import type React from "react";
import { createContext, useContext } from "react";

type UserType = {
  id: string;
  email: string;
  roles: string[];
};

interface UserContextType {
  user: UserType | null;
}

const UserContext = createContext<UserContextType>({ user: null });

export const UserProvider = ({
  user,
  children,
}: {
  user: UserType;
  children: React.ReactNode;
}) => {
  return (
    <UserContext.Provider value={{ user }}>{children}</UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
