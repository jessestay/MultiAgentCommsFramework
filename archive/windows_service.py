import win32serviceutil
import win32service
import win32event
import servicemanager
import socket
import sys
import os
from automation_scheduler import main as run_scheduler

class AutomationService(win32serviceutil.ServiceFramework):
    _svc_name_ = "LinkedInAutomation"
    _svc_display_name_ = "LinkedIn Automation Service"
    
    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.stop_event = win32event.CreateEvent(None, 0, 0, None)
        socket.setdefaulttimeout(60)
        
    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self.stop_event)
        
    def SvcDoRun(self):
        try:
            run_scheduler()
        except Exception as e:
            servicemanager.LogErrorMsg(str(e))

if __name__ == '__main__':
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(AutomationService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(AutomationService) 