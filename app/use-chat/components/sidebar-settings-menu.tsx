"use client";

import {
  CircleHelp,
  Keyboard,
  LogOut,
  Palette,
  Settings,
  UserRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { SidebarCollapsibleText } from "./sidebar-collapsible-text";

const settingsItems = [
  { label: "个人资料", icon: UserRound },
  { label: "偏好设置", icon: Settings },
  { label: "快捷键", icon: Keyboard },
  { label: "主题", icon: Palette },
];

export function SidebarSettingsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-interactive="true"
          variant="ghost"
          className="w-full justify-start gap-2"
        >
          <Settings className="size-4" />
          <SidebarCollapsibleText>设置</SidebarCollapsibleText>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        className="w-56"
      >
        <DropdownMenuLabel>设置</DropdownMenuLabel>
        {settingsItems.map((item) => {
          const Icon = item.icon;
          return (
            <DropdownMenuItem key={item.label}>
              <Icon className="size-4" />
              <span>{item.label}</span>
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />

        <DropdownMenuItem>
          <CircleHelp className="size-4" />
          <span>帮助与反馈</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <LogOut className="size-4" />
          <span>退出登录</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
