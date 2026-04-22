import { Button } from '@/components/ui';
import type { WeixinGatewayAccount } from '@shared/types';
import { LoaderCircle, PlugZap, QrCode, RefreshCw, Unplug } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';

type WeixinHealth = Awaited<ReturnType<typeof window.context.getWeixinGatewayHealth>>[number]

const HEALTH_STYLE: Record<WeixinHealth['status'], string> = {
  idle: 'bg-[#f3f3f6] text-[#6b6b7a]',
  running: 'bg-[#eef8ef] text-[#2f7d46]',
  paused: 'bg-[#f4f2ec] text-[#7d6740]',
  error: 'bg-[#fff1f2] text-[#b42318]',
  stopped: 'bg-[#f3f3f6] text-[#6b6b7a]'
}

export const ChannelsPage = () => {
  const { t, formatDateTime } = useI18n()
  const [accounts, setAccounts] = useState<WeixinGatewayAccount[]>([])
  const [health, setHealth] = useState<WeixinHealth[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isStartingQr, setIsStartingQr] = useState(false)
  const [isWaitingQr, setIsWaitingQr] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [sessionKey, setSessionKey] = useState<string | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [qrCodeImageUrl, setQrCodeImageUrl] = useState<string | null>(null)
  const [isRenderingQrCode, setIsRenderingQrCode] = useState(false)

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.accountId === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  )

  const healthMap = useMemo(() => {
    return new Map(health.map((item) => [item.accountId, item]))
  }, [health])

  const loadData = async (silent = false): Promise<void> => {
    if (!silent) {
      setIsLoading(true)
    }
    setIsRefreshing(silent)
    try {
      const [nextAccounts, nextHealth] = await Promise.all([
        window.context.listWeixinGatewayAccounts(),
        window.context.getWeixinGatewayHealth()
      ])
      setAccounts(nextAccounts)
      setHealth(nextHealth)
      setSelectedAccountId((current) => {
        if (current && nextAccounts.some((item) => item.accountId === current)) {
          return current
        }
        return nextAccounts[0]?.accountId ?? null
      })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('channels.loadFailed'))
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  useEffect(() => {
    if (!sessionKey || isWaitingQr) {
      return
    }

    const timer = window.setInterval(() => {
      void handleWaitQr(5000, true)
    }, 6000)
    return () => {
      window.clearInterval(timer)
    }
  }, [sessionKey, isWaitingQr])

  useEffect(() => {
    if (!qrCodeUrl) {
      setQrCodeImageUrl(null)
      setIsRenderingQrCode(false)
      return
    }

    let active = true
    setIsRenderingQrCode(true)

    void QRCode.toDataURL(qrCodeUrl, {
      width: 260,
      margin: 1
    })
      .then((dataUrl) => {
        if (!active) {
          return
        }
        setQrCodeImageUrl(dataUrl)
      })
      .catch((error) => {
        if (!active) {
          return
        }
        setQrCodeImageUrl(null)
        setErrorMessage(error instanceof Error ? error.message : t('channels.renderFailed'))
      })
      .finally(() => {
        if (!active) {
          return
        }
        setIsRenderingQrCode(false)
      })

    return () => {
      active = false
    }
  }, [qrCodeUrl])

  const handleStartQr = async () => {
    setIsStartingQr(true)
    setErrorMessage('')
    setStatusMessage('')
    try {
      const result = await window.context.startWeixinQrLogin({
        accountId: selectedAccountId ?? undefined,
        force: true
      })
      setSessionKey(result.sessionKey)
      setQrCodeUrl(result.qrCodeUrl)
      setStatusMessage(result.message)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('channels.generateFailed'))
    } finally {
      setIsStartingQr(false)
    }
  }

  const handleWaitQr = async (timeoutMs = 45000, silent = false) => {
    if (!sessionKey) {
      setErrorMessage(t('channels.generateFirst'))
      return
    }

    setIsWaitingQr(true)
    if (!silent) {
      setErrorMessage('')
      setStatusMessage('')
    }
    try {
      const result = await window.context.waitWeixinQrLogin({ sessionKey, timeoutMs })
      if (result.connected) {
        setStatusMessage(result.message)
        setSessionKey(null)
        setQrCodeUrl(null)
        await loadData(true)
        return
      }
      if (!silent) {
        setStatusMessage(result.message)
      }
    } catch (error) {
      if (!silent) {
        setErrorMessage(error instanceof Error ? error.message : t('channels.waitFailed'))
      }
    } finally {
      setIsWaitingQr(false)
    }
  }

  const handleDisconnect = async (accountId: string) => {
    const confirmed = window.confirm(t('channels.disconnectConfirm', { accountId }))
    if (!confirmed) {
      return
    }
    setErrorMessage('')
    setStatusMessage('')
    try {
      await window.context.disconnectWeixinGatewayAccount(accountId)
      setStatusMessage(t('channels.disconnected', { accountId }))
      await loadData(true)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('channels.disconnectFailed'))
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--content-bg)]">
      <aside className="flex w-[332px] min-w-[332px] flex-col border-r border-[var(--border-soft)] px-4 py-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[24px] font-semibold text-[var(--ink-main)]">
              {t('channels.title')}
            </p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--ink-faint)]">
              {t('channels.description')}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void loadData(true)}
            disabled={isLoading || isRefreshing}
            className="h-10 w-10 rounded-2xl border-[var(--border-soft)] bg-white"
          >
            {isRefreshing ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="mt-5 rounded-3xl border border-[var(--border-soft)] bg-white p-3 shadow-[0_10px_30px_rgba(15,15,20,0.05)]">
          <div className="max-h-[calc(100vh-250px)] space-y-2 overflow-auto pr-1">
            {accounts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-soft)] bg-[#fafafc] px-4 py-6 text-[13px] leading-6 text-[var(--ink-faint)]">
                {t('channels.empty')}
              </div>
            ) : (
              accounts.map((account) => {
                const isSelected = account.accountId === selectedAccountId
                const itemHealth = healthMap.get(account.accountId)
                return (
                  <button
                    key={account.accountId}
                    type="button"
                    onClick={() => setSelectedAccountId(account.accountId)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                      isSelected
                        ? 'border-[#d8d8e3] bg-[#f6f6fb] shadow-[0_10px_20px_rgba(15,15,20,0.04)]'
                        : 'border-transparent bg-[#fbfbfe] hover:bg-[#f5f5fa]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-[var(--ink-main)]">
                          {account.accountId}
                        </p>
                        <p className="mt-1 truncate text-[12px] text-[var(--ink-faint)]">
                          {account.baseUrl}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
                          itemHealth ? HEALTH_STYLE[itemHealth.status] : HEALTH_STYLE.idle
                        }`}
                      >
                        {itemHealth?.status ?? 'idle'}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 justify-center overflow-auto px-8 py-8">
        <div className="w-full max-w-[980px] space-y-6">
          <div className="rounded-3xl border border-[var(--border-soft)] bg-white px-8 py-7 shadow-[0_14px_38px_rgba(15,15,20,0.05)]">
            <h1 className="text-[28px] font-semibold text-[var(--ink-main)]">
              {t('channels.qrTitle')}
            </h1>
            <p className="mt-2 text-[14px] text-[var(--ink-faint)]">
              {t('channels.qrDescription')}
            </p>

            {errorMessage ? (
              <div className="mt-5 rounded-2xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-[13px] text-[#b42318]">
                {errorMessage}
              </div>
            ) : null}

            {statusMessage ? (
              <div className="mt-5 rounded-2xl border border-[#d7e7d8] bg-[#f3faf4] px-4 py-3 text-[13px] text-[#2f7d46]">
                {statusMessage}
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => void handleStartQr()}
                disabled={isStartingQr || isWaitingQr}
                className="rounded-2xl bg-[var(--ink-main)] text-white hover:bg-[#2c2c34]"
              >
                {isStartingQr ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <QrCode className="mr-2 h-4 w-4" />
                )}
                {t('channels.generateQr')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleWaitQr()}
                disabled={!sessionKey || isStartingQr || isWaitingQr}
                className="rounded-2xl border-[var(--border-soft)]"
              >
                {isWaitingQr ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="mr-2 h-4 w-4" />
                )}
                {t('channels.waitConfirm')}
              </Button>
            </div>

            <div className="mt-6 rounded-3xl border border-[var(--border-soft)] bg-[#fbfbfe] p-6">
              {qrCodeUrl ? (
                <div className="space-y-3">
                  {isRenderingQrCode ? (
                    <div className="flex h-[260px] w-[260px] items-center justify-center rounded-2xl border border-[var(--border-soft)] bg-white text-[13px] text-[var(--ink-faint)]">
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      {t('channels.renderingQr')}
                    </div>
                  ) : qrCodeImageUrl ? (
                    <img
                      src={qrCodeImageUrl}
                      alt={t('channels.qrAlt')}
                      className="h-[260px] w-[260px] rounded-2xl border border-[var(--border-soft)] bg-white object-contain p-3"
                    />
                  ) : (
                    <div className="flex h-[260px] w-[260px] items-center justify-center rounded-2xl border border-dashed border-[var(--border-soft)] bg-white text-[13px] text-[var(--ink-faint)]">
                      {t('channels.qrFailed')}
                    </div>
                  )}
                  <p className="text-[12px] text-[var(--ink-faint)]">
                    {t('channels.sessionId', { id: sessionKey ?? '' })}
                  </p>
                </div>
              ) : (
                <div className="flex h-[260px] w-[260px] items-center justify-center rounded-2xl border border-dashed border-[var(--border-soft)] bg-white text-[13px] text-[var(--ink-faint)]">
                  {t('channels.noQr')}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-[var(--border-soft)] bg-white px-8 py-7 shadow-[0_14px_38px_rgba(15,15,20,0.05)]">
            <h2 className="text-[22px] font-semibold text-[var(--ink-main)]">
              {t('channels.accountDetails')}
            </h2>
            {!selectedAccount ? (
              <p className="mt-3 text-[13px] text-[var(--ink-faint)]">
                {t('channels.selectAccount')}
              </p>
            ) : (
              <div className="mt-5 space-y-3 text-[13px] text-[var(--ink-soft)]">
                <p>{t('channels.accountId', { id: selectedAccount.accountId })}</p>
                <p>Base URL: {selectedAccount.baseUrl}</p>
                <p>{t('channels.routeTag', { value: selectedAccount.routeTag || t('common.notSet') })}</p>
                <p>
                  {t('channels.channelVersion', {
                    value: selectedAccount.channelVersion || t('common.notSet')
                  })}
                </p>
                <p>{t('channels.connectedAt', { time: formatDateTime(selectedAccount.connectedAt) })}</p>
                <p>
                  {t('channels.lastEvent', {
                    time: formatDateTime(
                      healthMap.get(selectedAccount.accountId)?.lastEventAt ?? null
                    )
                  })}
                </p>
                <p>
                  {t('channels.lastError', {
                    error: healthMap.get(selectedAccount.accountId)?.lastError || t('common.none')
                  })}
                </p>
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void handleDisconnect(selectedAccount.accountId)}
                    className="rounded-2xl"
                  >
                    <Unplug className="mr-2 h-4 w-4" />
                    {t('channels.disconnect')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
