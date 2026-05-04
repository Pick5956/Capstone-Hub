import { can } from "@/src/lib/rbac";
import { useAuth } from "@/src/providers/AuthProvider";
import { Permission } from "@/src/types/auth";
import { ReactNode } from "react";

interface PermissionGuardProps{
    permission: Permission
    children: ReactNode
}

export default function PermissionGuard({
    permission,
    children
}: PermissionGuardProps){
    const { activeMembership } = useAuth();

    if (!can(activeMembership, permission)){
        return null;
    }
    return <>{children}</>
}
