@echo off
chcp 65001 >nul
title Telepresence 快速连接工具

:MENU
cls
echo ========================================
echo       Telepresence 快速连接工具
echo ========================================
echo.
echo   [1] 连接 (telepresence connect) [默认]
echo   [2] 断开 (telepresence quit)
echo   [3] 查看状态 (telepresence status)
echo   [0] 退出脚本
echo.
echo ========================================
set /p choice=请输入选项 (直接回车默认连接):

if "%choice%"=="" goto CONNECT
if "%choice%"=="1" goto CONNECT
if "%choice%"=="2" goto QUIT
if "%choice%"=="3" goto STATUS
if "%choice%"=="0" goto END
echo 无效选项，请重新输入
timeout /t 2 >nul
goto MENU

:CONNECT
echo.
echo 请选择命名空间 (namespace):
echo   [1] dev-mc  [默认]888
echo   [2] dev
echo.
set /p ns_choice=请输入选项 (直接回车默认 dev-mc):

if "%ns_choice%"=="" set "namespace=dev-mc"
if "%ns_choice%"=="1" set "namespace=dev-mc"
if "%ns_choice%"=="2" set "namespace=dev"

if not defined namespace (
    echo 无效选项，将使用默认命名空间 dev-mc
    set "namespace=dev-mc"
)

echo.
echo 正在连接 Telepresence (命名空间: %namespace%)...
telepresence connect --kubeconfig C:/Users/10456/.cs/kube-config --insecure-skip-tls-verify --namespace %namespace%
echo.
echo 连接操作完成，窗口将在 5 秒后自动关闭...
timeout /t 5 >nul
exit /b 0

:QUIT
echo.
echo 正在断开 Telepresence...
telepresence quit
echo.
echo 断开操作完成
pause
goto MENU

:STATUS
echo.
echo 当前 Telepresence 状态:
telepresence status
echo.
pause
goto MENU

:END
echo 再见!
exit /b 0
