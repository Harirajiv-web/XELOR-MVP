import { Module } from "@nestjs/common";
import { ConnectivityController } from "./connectivity.controller.js";
import { ConnectivityService } from "./connectivity.service.js";

@Module({ controllers: [ConnectivityController], providers: [ConnectivityService], exports: [ConnectivityService] })
export class ConnectivityModule {}
