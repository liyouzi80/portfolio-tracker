"use client";

import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-zinc-400 text-sm">页面出错了</p>
            <Button variant="outline" size="sm" onClick={() => this.setState({ hasError: false })}
              className="border-zinc-700 text-zinc-300">
              重试
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}
