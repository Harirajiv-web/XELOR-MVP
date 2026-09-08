import { Module } from "@nestjs/common";
import { HrmController } from "./hrm.controller.js";
import { EmployeeService } from "./employee.service.js";
import { AttendanceService } from "./attendance.service.js";
import { LeaveService } from "./leave.service.js";
import { PayrollService } from "./payroll.service.js";
import { StatutoryConfigService } from "./statutory-config.service.js";
import { FakeBiometricDevice } from "./fake-device.adapter.js";
import { BIOMETRIC_DEVICE } from "../../ports/biometric.port.js";

/**
 * HRM & ATTENDANCE (RASP, Module 09).
 *
 * Note the dependency direction, which is the same one ACCOUNTS established: HRM depends
 * on `ACCOUNTS_POSTER` to post its payroll journal, and Accounts depends on nothing here.
 * HRM decides what the amounts are; Accounts decides whether they may be recorded. Neither
 * recomputes the other, and the module graph stays acyclic.
 *
 * `BIOMETRIC_DEVICE` binds the deterministic fake adapter. The real ZKTeco/eSSL bridge is
 * post-MVP and slots in here without any change above the port — which is the entire point
 * of having fixed the contract now (HR-20, NFR-12).
 */
@Module({
  controllers: [HrmController],
  providers: [
    StatutoryConfigService,
    EmployeeService,
    AttendanceService,
    LeaveService,
    PayrollService,
    FakeBiometricDevice,
    { provide: BIOMETRIC_DEVICE, useExisting: FakeBiometricDevice },
  ],
  exports: [EmployeeService, AttendanceService, LeaveService, PayrollService, StatutoryConfigService],
})
export class HrmModule {}
