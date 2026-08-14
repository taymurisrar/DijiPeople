DijiPeople Integration Gateway
==============================

This program collects attendance from the fingerprint and card terminals on your
network and sends it to DijiPeople. It runs quietly in the background and starts
automatically with Windows. Once it is set up you should never need to open it.


WHAT THIS MACHINE NEEDS
-----------------------

  * Windows 10 or 11, or Windows Server 2016 or later, 64-bit.
  * Network access from this machine to your attendance terminals.
  * Outbound HTTPS access from this machine to DijiPeople.
  * For ZKTeco terminals: the ZKTeco communication component, which the
    "Fingerprint Attendance System" software installs. If you already manage the
    terminals from this machine, it is already there.

Nothing else is required. You do not need to install .NET, Node.js, npm, Git,
Visual Studio or any development tools.


INSTALLING
----------

  1. Unpack this folder somewhere on the machine, for example your Desktop.

  2. In DijiPeople, go to
        Settings > Integrations > Attendance > Gateways
     Create a gateway (or open the one you already made) and generate a pairing
     code. The code can be used once and expires shortly, so generate it when
     you are ready to install.

  3. Open PowerShell as Administrator: right-click the Start button, choose
     "Terminal (Admin)" or "Windows PowerShell (Admin)".

  4. Change to this folder and run:

        ./install.ps1 -Url https://api.yourcompany.com -PairingCode ABCD-EFGH

     Replace the address with your DijiPeople address and the code with the one
     you just generated.

That is the whole installation. The gateway is now a Windows service. It will
start again by itself after a restart or a power cut.


CHECKING IT IS WORKING
----------------------

In DijiPeople, the gateway appears as Online within a minute or two, on the same
Gateways page.

On this machine you can also run, from the installation folder:

    DijiPeople.Gateway.exe status

That shows the version, whether it is paired, and how many attendance records
are waiting to be uploaded. Waiting records are normal for a short time; they
should not keep growing.


IF SOMETHING LOOKS WRONG
------------------------

Collect a support file and send it to DijiPeople:

    DijiPeople.Gateway.exe diagnostics

It writes a file under
    C:\ProgramData\DijiPeople\IntegrationGateway\diagnostics

The file contains version numbers, device health, queue counts and recent log
messages. It deliberately contains no passwords, no device keys and no
attendance records, so it is safe to email.


WHAT IT DOES AND DOES NOT DO
----------------------------

  * It reads attendance records and the list of user IDs from your terminals.
  * It NEVER reads fingerprints, face data or any other biometric information.
    It cannot: there is no code in it that can request them.
  * It NEVER stores the passwords or PINs your terminals hold.
  * It NEVER changes anything on your terminals. It does not clear their logs,
    does not set their clocks, and does not add or remove users.
  * It only makes outgoing connections. It does not open any port on this
    machine, and DijiPeople cannot connect in to your network.

If a terminal's clock has drifted, DijiPeople will tell you. It will not change
the clock for you — that is your equipment and other software may depend on it.


IF THE INTERNET GOES DOWN
-------------------------

Nothing is lost. The gateway keeps reading your terminals and stores the records
on this machine. When the connection returns it uploads everything it was
holding. Records that DijiPeople already has are recognised and not duplicated.
The same is true if this machine is restarted mid-upload.


REMOVING IT
-----------

From an elevated PowerShell window, in the folder you unpacked:

    ./uninstall.ps1

This keeps any attendance records still waiting to be uploaded, in case you are
upgrading or moving the gateway. Add -RemoveData to delete them as well.

Remember to revoke the gateway in DijiPeople afterwards, on the same Gateways
page, so its credential stops working.


COMMANDS
--------

Run these from the installation folder,
C:\Program Files\DijiPeople\Integration Gateway

    DijiPeople.Gateway.exe status         what this gateway knows
    DijiPeople.Gateway.exe diagnostics    write a support file
    DijiPeople.Gateway.exe stop           stop the service
    DijiPeople.Gateway.exe start          start the service
    DijiPeople.Gateway.exe restart        restart the service
    DijiPeople.Gateway.exe pair --code X  pair, or re-pair after a reset
    DijiPeople.Gateway.exe requeue        retry records that stopped retrying
    DijiPeople.Gateway.exe help           the full list
